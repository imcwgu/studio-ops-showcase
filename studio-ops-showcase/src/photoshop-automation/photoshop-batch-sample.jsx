/**
 * photoshop-batch-sample.jsx
 * -----------------------------------------------------------------------------
 * Illustrative excerpt from a Photoshop ExtendScript (JSX) batch processor.
 * Sanitized public version: production folder paths, action names, and
 * category-specific colour profiles have been generalized.
 *
 * The script applies category-specific corrections to a folder of TIFFs, then
 * exports two web sizes plus an archive master. Category is read from a
 * sidecar metadata file written upstream by the folder watcher.
 *
 * Stack: Adobe Photoshop ExtendScript (ECMAScript 3-flavoured JS).
 *
 * Notes for readers unfamiliar with JSX:
 *   - `var` only; no `let`/`const`. No arrow functions. No template literals.
 *   - File system access via the File and Folder objects.
 *   - Documents are opened, modified in place, and explicitly closed.
 *   - Photoshop actions are invoked by name from a loaded action set.
 * -----------------------------------------------------------------------------
 */

#target photoshop
app.bringToFront();

// =====================================================================
// Configuration
// =====================================================================

var CONFIG = {
    inputFolder: "/path/to/working/folder/raw",
    outputFolder: "/path/to/working/folder/exports",
    masterFolder: "/path/to/working/folder/masters",
    actionSet: "studio-batch-actions",
    sidecarSuffix: ".meta.txt",
    webSizes: [
        { name: "large", longEdge: 2000, quality: 10 },
        { name: "thumb", longEdge: 600,  quality: 8  }
    ]
};

// Category to action name. Each action handles white balance, background
// cleanup, and category-specific tonal adjustments. Footwear uses a
// stricter symmetry pass; apparel uses a softer fabric-friendly correction.
var CATEGORY_ACTIONS = {
    "sneaker":  "correction-footwear-strict",
    "boot":     "correction-footwear-strict",
    "sandal":   "correction-footwear-soft",
    "apparel":  "correction-apparel-fabric",
    "default":  "correction-default"
};


// =====================================================================
// Sidecar metadata
// =====================================================================
// Each TIFF has an adjacent .meta.txt with one key=value per line, written
// by the upstream folder watcher. Reading category from the sidecar means
// JSX never has to look anything up over the network.

function readSidecar(tifFile) {
    var sidecar = new File(tifFile.fsName + CONFIG.sidecarSuffix);
    if (!sidecar.exists) {
        return { category: "default" };
    }

    var meta = {};
    sidecar.open("r");
    while (!sidecar.eof) {
        var line = sidecar.readln();
        var eq = line.indexOf("=");
        if (eq > 0) {
            var key = line.substring(0, eq).replace(/^\s+|\s+$/g, "");
            var val = line.substring(eq + 1).replace(/^\s+|\s+$/g, "");
            meta[key] = val;
        }
    }
    sidecar.close();
    return meta;
}


// =====================================================================
// Action invocation
// =====================================================================

function applyCategoryAction(doc, category) {
    var actionName = CATEGORY_ACTIONS[category] || CATEGORY_ACTIONS["default"];
    try {
        app.doAction(actionName, CONFIG.actionSet);
    } catch (e) {
        throw new Error("Action '" + actionName + "' failed: " + e.message);
    }
}


// =====================================================================
// Export
// =====================================================================

function resizeForWeb(doc, longEdge) {
    // Duplicate so the master is untouched.
    var copy = doc.duplicate();
    var w = copy.width.as("px");
    var h = copy.height.as("px");
    var scale = w >= h ? longEdge / w : longEdge / h;
    copy.resizeImage(
        UnitValue(w * scale, "px"),
        UnitValue(h * scale, "px"),
        72,
        ResampleMethod.BICUBICSHARPER
    );
    return copy;
}

function exportJpeg(doc, outFile, quality) {
    var opts = new JPEGSaveOptions();
    opts.quality = quality;
    opts.embedColorProfile = true;
    opts.formatOptions = FormatOptions.STANDARDBASELINE;
    doc.saveAs(outFile, opts, true, Extension.LOWERCASE);
}

function saveMasterTiff(doc, outFile) {
    var opts = new TiffSaveOptions();
    opts.embedColorProfile = true;
    opts.imageCompression = TIFFEncoding.TIFFLZW;
    opts.layers = false;  // flatten before archiving
    doc.saveAs(outFile, opts, true, Extension.LOWERCASE);
}

function exportAllSizes(doc, baseName) {
    var outFolder = new Folder(CONFIG.outputFolder);
    if (!outFolder.exists) outFolder.create();

    for (var i = 0; i < CONFIG.webSizes.length; i++) {
        var size = CONFIG.webSizes[i];
        var resized = resizeForWeb(doc, size.longEdge);
        var outFile = new File(outFolder.fsName + "/" +
                               baseName + "_" + size.name + ".jpg");
        exportJpeg(resized, outFile, size.quality);
        resized.close(SaveOptions.DONOTSAVECHANGES);
    }

    var masterFolder = new Folder(CONFIG.masterFolder);
    if (!masterFolder.exists) masterFolder.create();
    var masterFile = new File(masterFolder.fsName + "/" + baseName + ".tif");
    saveMasterTiff(doc, masterFile);
}


// =====================================================================
// Per-file processing
// =====================================================================

function processFile(tifFile) {
    var meta = readSidecar(tifFile);
    var category = meta.category || "default";

    var doc = app.open(tifFile);
    try {
        applyCategoryAction(doc, category);
        var baseName = tifFile.name.replace(/\.[^.]+$/, "");
        exportAllSizes(doc, baseName);
    } finally {
        doc.close(SaveOptions.DONOTSAVECHANGES);
    }
}


// =====================================================================
// Entry point
// =====================================================================

function main() {
    var folder = new Folder(CONFIG.inputFolder);
    if (!folder.exists) {
        alert("Input folder does not exist: " + CONFIG.inputFolder);
        return;
    }

    var files = folder.getFiles(/\.(tif|tiff)$/i);
    var processed = 0;
    var failed = 0;

    for (var i = 0; i < files.length; i++) {
        try {
            processFile(files[i]);
            processed++;
        } catch (e) {
            failed++;
            $.writeln("FAILED: " + files[i].name + " — " + e.message);
        }
    }

    alert("Batch complete.\nProcessed: " + processed + "\nFailed: " + failed);
}

main();

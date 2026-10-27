var exec = require("cordova/exec");

module.exports = {
    save: function (filename, mimeType, content, onSuccess, onError) {
        exec(
            onSuccess,
            onError,
            "NotenPfotenSaveDataFile",
            "save",
            [filename, mimeType, content]
        );
    },
    open: function (mimeType, onSuccess, onError) {
        exec(
            onSuccess,
            onError,
            "NotenPfotenSaveDataFile",
            "open",
            [mimeType]
        );
    },
    openStream: function (mimeType, onSuccess, onError) {
        exec(onSuccess, onError, "NotenPfotenSaveDataFile", "openStream", [mimeType]);
    },
    readChunk: function (token, onSuccess, onError) {
        exec(onSuccess, onError, "NotenPfotenSaveDataFile", "readChunk", [token]);
    },
    closeStream: function (token, onSuccess, onError) {
        exec(onSuccess, onError, "NotenPfotenSaveDataFile", "closeStream", [token]);
    },
    openWriteStream: function (filename, mimeType, onSuccess, onError) {
        exec(onSuccess, onError, "NotenPfotenSaveDataFile", "openWriteStream",
            [filename, mimeType]);
    },
    writeChunk: function (token, content, onSuccess, onError) {
        exec(onSuccess, onError, "NotenPfotenSaveDataFile", "writeChunk",
            [token, content]);
    },
    writeBinaryChunk: function (token, base64, onSuccess, onError) {
        exec(onSuccess, onError, "NotenPfotenSaveDataFile", "writeBinaryChunk",
            [token, base64]);
    },
    finishWriteStream: function (token, expectedBytes, onSuccess, onError) {
        exec(onSuccess, onError, "NotenPfotenSaveDataFile", "finishWriteStream", [token, expectedBytes]);
    },
    abortWriteStream: function (token, onSuccess, onError) {
        exec(onSuccess, onError, "NotenPfotenSaveDataFile", "abortWriteStream", [token]);
    }
};

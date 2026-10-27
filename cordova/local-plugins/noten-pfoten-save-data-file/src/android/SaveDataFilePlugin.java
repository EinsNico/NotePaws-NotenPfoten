package de.nico.notenpfoten.savedata;

import android.app.Activity;
import android.database.Cursor;
import android.content.Intent;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.util.Base64;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

public class SaveDataFilePlugin extends CordovaPlugin {
    private static final int CREATE_DOCUMENT_REQUEST = 52041;
    private static final int OPEN_DOCUMENT_REQUEST = 52042;
    private static final int OPEN_STREAM_REQUEST = 52043;
    private static final int CREATE_STREAM_REQUEST = 52044;
    private static final int STREAM_CHUNK_BYTES = 64 * 1024;
    private static final int MAX_WRITE_CHUNK_BYTES = 256 * 1024;
    // Temporary guard until large backups can be imported in bounded batches.
    private static final long MAX_IMPORT_SIZE_BYTES = 12L * 1024L * 1024L;
    private static final String FILE_TOO_LARGE = "file-too-large";

    private CallbackContext pendingCallback;
    private String pendingContent;
    private final Object streamLock = new Object();
    private InputStream activeStream;
    private String activeStreamToken;
    private boolean streamOpening;
    private boolean streamReading;
    private final Object writeLock = new Object();
    private OutputStream activeWriteStream;
    private Uri activeWriteUri;
    private String activeWriteToken;
    private long activeWriteBytes;
    private boolean streamWriting;
    private boolean writeStreamOpening;

    @Override
    public boolean execute(
            String action,
            JSONArray arguments,
            CallbackContext callbackContext
    ) throws JSONException {
        if ("readChunk".equals(action)) {
            readStreamChunk(arguments.optString(0, ""), callbackContext);
            return true;
        }
        if ("closeStream".equals(action)) {
            closeStream(arguments.optString(0, ""), callbackContext);
            return true;
        }
        if ("writeChunk".equals(action)) {
            writeStreamChunk(arguments.optString(0, ""),
                    arguments.optString(1, null), callbackContext);
            return true;
        }
        if ("writeBinaryChunk".equals(action)) {
            String encoded = arguments.optString(1, null);
            if (encoded == null || encoded.length() > ((MAX_WRITE_CHUNK_BYTES + 2) / 3) * 4) {
                callbackContext.error("Binary chunk is too large or missing.");
            } else {
                try {
                    writeStreamBytes(arguments.optString(0, ""),
                            Base64.decode(encoded, Base64.NO_WRAP), callbackContext);
                } catch (IllegalArgumentException invalid) {
                    callbackContext.error("Invalid binary chunk.");
                }
            }
            return true;
        }
        if ("finishWriteStream".equals(action)
                || "abortWriteStream".equals(action)) {
            finishWriteStream(arguments.optString(0, ""),
                    "abortWriteStream".equals(action), arguments.optLong(1, -1), callbackContext);
            return true;
        }
        if (!"save".equals(action) && !"open".equals(action)
                && !"openStream".equals(action)
                && !"openWriteStream".equals(action)) {
            return false;
        }
        if (pendingCallback != null) {
            callbackContext.error("A document dialog is already open.");
            return true;
        }

        if ("openWriteStream".equals(action)) {
            synchronized (writeLock) {
                if (activeWriteStream != null || writeStreamOpening || streamWriting) {
                    callbackContext.error("write-stream-already-open");
                    return true;
                }
                writeStreamOpening = true;
            }
            String filename = arguments.optString(0, "Noten-Pfoten-Speicherstand.json");
            String mimeType = arguments.optString(1, "application/json");
            pendingCallback = callbackContext;
            cordova.getActivity().runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mimeType.length() > 0 ? mimeType : "application/json");
                intent.putExtra(Intent.EXTRA_TITLE, filename);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                try {
                    cordova.startActivityForResult(SaveDataFilePlugin.this,
                            intent, CREATE_STREAM_REQUEST);
                } catch (RuntimeException error) {
                    synchronized (writeLock) { writeStreamOpening = false; }
                    finishWithError("The Android save dialog could not be opened.");
                }
            });
            return true;
        }

        if ("open".equals(action) || "openStream".equals(action)) {
            if ("openStream".equals(action)) {
                synchronized (streamLock) {
                    if (activeStream != null || streamOpening || streamReading) {
                        callbackContext.error("stream-already-open");
                        return true;
                    }
                }
            }
            String mimeType = arguments.optString(0, "application/json");
            final int requestCode = "openStream".equals(action)
                    ? OPEN_STREAM_REQUEST : OPEN_DOCUMENT_REQUEST;
            pendingCallback = callbackContext;
            cordova.getActivity().runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mimeType.length() > 0 ? mimeType : "application/json");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {
                    cordova.startActivityForResult(
                            SaveDataFilePlugin.this,
                            intent,
                            requestCode
                    );
                } catch (RuntimeException error) {
                    finishWithError("The Android document picker could not be opened.");
                }
            });
            return true;
        }

        String filename = arguments.optString(0, "Noten-Pfoten-Speicherstand.json");
        String mimeType = arguments.optString(1, "application/json");
        String content = arguments.optString(2, null);
        if (filename.length() == 0 || content == null) {
            callbackContext.error("Filename and file content are required.");
            return true;
        }

        pendingCallback = callbackContext;
        pendingContent = content;
        cordova.getActivity().runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(mimeType.length() > 0 ? mimeType : "application/json");
            intent.putExtra(Intent.EXTRA_TITLE, filename);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            try {
                cordova.startActivityForResult(
                        SaveDataFilePlugin.this,
                        intent,
                        CREATE_DOCUMENT_REQUEST
                );
            } catch (RuntimeException error) {
                finishWithError("The Android save dialog could not be opened.");
            }
        });
        return true;
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent intent) {
        if (
                (requestCode != CREATE_DOCUMENT_REQUEST
                        && requestCode != OPEN_DOCUMENT_REQUEST
                        && requestCode != OPEN_STREAM_REQUEST
                        && requestCode != CREATE_STREAM_REQUEST)
                || pendingCallback == null
        ) {
            return;
        }
        if (resultCode != Activity.RESULT_OK) {
            if (requestCode == CREATE_STREAM_REQUEST) {
                synchronized (writeLock) { writeStreamOpening = false; }
            }
            finishWithStatus("cancelled");
            return;
        }

        Uri destination = intent == null ? null : intent.getData();
        if (destination == null) {
            if (requestCode == CREATE_STREAM_REQUEST) {
                synchronized (writeLock) { writeStreamOpening = false; }
            }
            finishWithError("Android did not return a document.");
            return;
        }

        if (requestCode == OPEN_DOCUMENT_REQUEST) {
            readSelectedDocument(destination);
            return;
        }
        if (requestCode == OPEN_STREAM_REQUEST) {
            openSelectedStream(destination);
            return;
        }
        if (requestCode == CREATE_STREAM_REQUEST) {
            openSelectedWriteStream(destination);
            return;
        }

        CallbackContext callback = pendingCallback;
        String content = pendingContent;
        clearPendingSave();
        cordova.getThreadPool().execute(() -> {
            try (
                    OutputStream output = cordova.getContext()
                            .getContentResolver()
                            .openOutputStream(destination, "w");
                    Writer writer = output == null
                            ? null
                            : new OutputStreamWriter(output, StandardCharsets.UTF_8)
            ) {
                if (writer == null) {
                    callback.error("Android could not open the selected destination.");
                    return;
                }
                writer.write(content);
                writer.flush();
                callback.success(createStatus("saved"));
            } catch (Exception error) {
                callback.error("The save-data file could not be written.");
            }
        });
    }

    private void readSelectedDocument(Uri source) {
        CallbackContext callback = pendingCallback;
        clearPendingSave();
        cordova.getThreadPool().execute(() -> {
            long declaredSize = getDocumentSize(source);
            if (declaredSize > MAX_IMPORT_SIZE_BYTES) {
                callback.error(FILE_TOO_LARGE);
                return;
            }
            try (
                    InputStream input = cordova.getContext()
                            .getContentResolver()
                            .openInputStream(source);
                    ByteArrayOutputStream output = new ByteArrayOutputStream()
            ) {
                if (input == null) {
                    callback.error("Android could not open the selected document.");
                    return;
                }
                byte[] buffer = new byte[8192];
                int bytesRead;
                long totalBytes = 0;
                while ((bytesRead = input.read(buffer)) != -1) {
                    totalBytes += bytesRead;
                    if (totalBytes > MAX_IMPORT_SIZE_BYTES) {
                        callback.error(FILE_TOO_LARGE);
                        return;
                    }
                    output.write(buffer, 0, bytesRead);
                }
                callback.success(createOpenResult(
                        new String(output.toByteArray(), StandardCharsets.UTF_8),
                        totalBytes
                ));
            } catch (Exception error) {
                callback.error("The selected document could not be read.");
            }
        });
    }

    private void openSelectedWriteStream(Uri destination) {
        CallbackContext callback = pendingCallback;
        clearPendingSave();
        cordova.getThreadPool().execute(() -> {
            OutputStream output = null;
            try {
                output = cordova.getContext().getContentResolver()
                        .openOutputStream(destination, "w");
                if (output == null) {
                    deleteCreatedDocument(destination);
                    callback.error("Android could not open the selected destination.");
                    return;
                }
                String token = UUID.randomUUID().toString();
                synchronized (writeLock) {
                    activeWriteStream = output;
                    activeWriteUri = destination;
                    activeWriteToken = token;
                    activeWriteBytes = 0;
                    output = null;
                }
                JSONObject result = createStatus("selected");
                result.put("token", token);
                callback.success(result);
            } catch (Exception error) {
                discardActiveWriteStream();
                deleteCreatedDocument(destination);
                callback.error("The selected destination could not be opened.");
            } finally {
                if (output != null) {
                    try { output.close(); } catch (Exception ignored) { }
                }
                synchronized (writeLock) { writeStreamOpening = false; }
            }
        });
    }

    private void writeStreamChunk(String token, String content,
            CallbackContext callback) {
        if (content == null) {
            callback.error("A backup chunk is required.");
            return;
        }
        writeStreamBytes(token, content.getBytes(StandardCharsets.UTF_8), callback);
    }

    private void writeStreamBytes(String token, byte[] bytes,
            CallbackContext callback) {
        if (bytes.length > MAX_WRITE_CHUNK_BYTES) {
            callback.error("Backup chunk is too large.");
            return;
        }
        synchronized (writeLock) {
            if (activeWriteStream == null || !token.equals(activeWriteToken)) {
                callback.error("write-stream-not-open");
                return;
            }
            if (streamWriting) {
                callback.error("write-stream-busy");
                return;
            }
            streamWriting = true;
        }
        cordova.getThreadPool().execute(() -> {
            String error = null;
            try {
                synchronized (writeLock) {
                    activeWriteStream.write(bytes);
                    activeWriteBytes += bytes.length;
                }
            } catch (Exception failure) {
                error = "The backup chunk could not be written.";
                discardActiveWriteStream();
            } finally {
                synchronized (writeLock) { streamWriting = false; }
            }
            if (error != null) {
                callback.error(error);
            } else {
                try { callback.success(createStatus("written")); }
                catch (JSONException failure) {
                    discardActiveWriteStream();
                    callback.error("The backup write could not be confirmed.");
                }
            }
        });
    }

    private void finishWriteStream(String token, boolean abort, long expectedBytes,
            CallbackContext callback) {
        synchronized (writeLock) {
            if (activeWriteStream == null || !token.equals(activeWriteToken)) {
                callback.error("write-stream-not-open");
                return;
            }
            if (streamWriting) {
                callback.error("write-stream-busy");
                return;
            }
            streamWriting = true;
        }
        cordova.getThreadPool().execute(() -> {
            if (abort) {
                discardActiveWriteStream();
                synchronized (writeLock) { streamWriting = false; }
                try { callback.success(createStatus("aborted")); }
                catch (JSONException error) { callback.error("The backup could not be aborted."); }
                return;
            }
            boolean outputClosed = false;
            try {
                OutputStream output;
                Uri destination;
                synchronized (writeLock) {
                    output = activeWriteStream;
                    destination = activeWriteUri;
                    if (expectedBytes <= 0 || expectedBytes != activeWriteBytes) {
                        throw new IllegalStateException("Backup write count does not match.");
                    }
                }
                output.flush();
                output.close();
                outputClosed = true;
                long storedBytes;
                // Reopen the document instead of trusting cached provider metadata.
                try (InputStream input = cordova.getContext().getContentResolver()
                        .openInputStream(destination)) {
                    storedBytes = BackupFileSizeVerifier.verify(input, expectedBytes);
                }
                JSONObject result = createStatus("saved");
                result.put("verified", true);
                result.put("bytesWritten", storedBytes);
                synchronized (writeLock) {
                    activeWriteStream = null;
                    activeWriteUri = null;
                    activeWriteToken = null;
                    activeWriteBytes = 0;
                    streamWriting = false;
                }
                callback.success(result);
            } catch (Exception error) {
                releaseActiveWriteStream(!outputClosed);
                synchronized (writeLock) { streamWriting = false; }
                callback.error(outputClosed ? "backup-file-verification-failed"
                        : "The backup file could not be completed.");
            }
        });
    }

    private void discardActiveWriteStream() {
        releaseActiveWriteStream(true);
    }

    private void releaseActiveWriteStream(boolean deleteDocument) {
        OutputStream output;
        Uri destination;
        synchronized (writeLock) {
            output = activeWriteStream;
            destination = activeWriteUri;
            activeWriteStream = null;
            activeWriteUri = null;
            activeWriteToken = null;
            activeWriteBytes = 0;
        }
        if (output != null) {
            try { output.close(); } catch (Exception ignored) { }
        }
        if (destination != null && deleteDocument) {
            deleteCreatedDocument(destination);
        }
    }

    private void deleteCreatedDocument(Uri destination) {
        try {
            cordova.getContext().getContentResolver()
                    .delete(destination, null, null);
        } catch (Exception ignored) { }
    }

    private void openSelectedStream(Uri source) {
        CallbackContext callback = pendingCallback;
        clearPendingSave();
        synchronized (streamLock) {
            streamOpening = true;
        }
        cordova.getThreadPool().execute(() -> {
            InputStream input = null;
            try {
                // Provider metadata can report zero or a stale size. Only an
                // actual descriptor size may select the bounded text importer.
                long verifiedSize = -1;
                try (ParcelFileDescriptor descriptor = cordova.getContext()
                        .getContentResolver().openFileDescriptor(source, "r")) {
                    if (descriptor != null) verifiedSize = descriptor.getStatSize();
                } catch (Exception ignored) {
                    // Pipes/cloud providers need the streaming importer.
                }
                long size = verifiedSize >= 0 ? verifiedSize : getDocumentSize(source);
                input = cordova.getContext().getContentResolver().openInputStream(source);
                if (input == null) {
                    callback.error("The selected document could not be opened.");
                    return;
                }
                String token = UUID.randomUUID().toString();
                synchronized (streamLock) {
                    activeStream = input;
                    activeStreamToken = token;
                    input = null;
                }
                JSONObject result = createStatus("selected");
                result.put("token", token);
                result.put("size", size);
                result.put("sizeVerified", verifiedSize >= 0);
                callback.success(result);
            } catch (Exception error) {
                callback.error("The selected document could not be opened.");
            } finally {
                if (input != null) {
                    try { input.close(); } catch (Exception ignored) { }
                }
                synchronized (streamLock) {
                    streamOpening = false;
                }
            }
        });
    }

    private void readStreamChunk(String token, CallbackContext callback) {
        synchronized (streamLock) {
            if (activeStream == null || !token.equals(activeStreamToken)) {
                callback.error("stream-not-open");
                return;
            }
            if (streamReading) {
                callback.error("stream-read-in-progress");
                return;
            }
            streamReading = true;
        }
        cordova.getThreadPool().execute(() -> {
            try {
                byte[] bytes = new byte[STREAM_CHUNK_BYTES];
                int count;
                synchronized (streamLock) {
                    count = activeStream.read(bytes);
                }
                JSONObject result = createStatus("chunk");
                result.put("token", token);
                result.put("done", count == -1);
                result.put("data", count == -1 ? ""
                        : Base64.encodeToString(bytes, 0, count, Base64.NO_WRAP));
                if (count == -1) {
                    closeActiveStream();
                }
                callback.success(result);
            } catch (Exception error) {
                closeActiveStream();
                callback.error("The selected document could not be read.");
            } finally {
                synchronized (streamLock) {
                    streamReading = false;
                }
            }
        });
    }

    private void closeStream(String token, CallbackContext callback) {
        synchronized (streamLock) {
            if (activeStream == null || !token.equals(activeStreamToken)) {
                callback.error("stream-not-open");
                return;
            }
            if (streamReading) {
                callback.error("stream-read-in-progress");
                return;
            }
            closeActiveStream();
        }
        try {
            callback.success(createStatus("closed"));
        } catch (JSONException error) {
            callback.error("The stream could not be closed.");
        }
    }

    private void closeActiveStream() {
        synchronized (streamLock) {
            if (activeStream != null) {
                try { activeStream.close(); } catch (Exception ignored) { }
            }
            activeStream = null;
            activeStreamToken = null;
        }
    }

    @Override
    public void onDestroy() {
        closeActiveStream();
        discardActiveWriteStream();
        super.onDestroy();
    }

    private long getDocumentSize(Uri source) {
        try (Cursor cursor = cordova.getContext().getContentResolver().query(
                source, new String[] { OpenableColumns.SIZE }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (index >= 0 && !cursor.isNull(index)) {
                    return cursor.getLong(index);
                }
            }
        } catch (Exception ignored) {
            // Some document providers omit metadata; the bounded read below
            // still rejects them before a large bridge message is created.
        }
        return -1;
    }

    private JSONObject createStatus(String status) throws JSONException {
        JSONObject result = new JSONObject();
        result.put("status", status);
        return result;
    }

    private JSONObject createOpenResult(String content, long size) throws JSONException {
        JSONObject result = createStatus("selected");
        result.put("content", content);
        result.put("size", size);
        return result;
    }

    private void finishWithStatus(String status) {
        CallbackContext callback = pendingCallback;
        clearPendingSave();
        if (callback == null) {
            return;
        }
        try {
            callback.success(createStatus(status));
        } catch (JSONException error) {
            callback.error("The save result could not be returned.");
        }
    }

    private void finishWithError(String message) {
        CallbackContext callback = pendingCallback;
        clearPendingSave();
        if (callback != null) {
            callback.error(message);
        }
    }

    private void clearPendingSave() {
        pendingCallback = null;
        pendingContent = null;
    }
}

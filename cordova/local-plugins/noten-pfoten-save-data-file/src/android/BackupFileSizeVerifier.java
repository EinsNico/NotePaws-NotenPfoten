package de.nico.notenpfoten.savedata;

import java.io.IOException;
import java.io.InputStream;

/** Counts the stored bytes; document-provider SIZE metadata can be stale. */
final class BackupFileSizeVerifier {
    static long verify(InputStream input, long expectedBytes) throws IOException {
        if (input == null || expectedBytes <= 0) {
            throw new IOException("The saved backup cannot be read.");
        }
        long bytesRead = 0;
        byte[] buffer = new byte[64 * 1024];
        int count;
        while ((count = input.read(buffer)) != -1) {
            bytesRead += count;
            if (bytesRead > expectedBytes) {
                throw new IOException("The saved backup is longer than expected.");
            }
        }
        if (bytesRead != expectedBytes) {
            throw new IOException("The saved backup is incomplete.");
        }
        return bytesRead;
    }
}

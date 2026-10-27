package de.nico.notenpfoten.savedata;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Paths;

public final class BackupFileSizeVerifierTest {
    private static void reject(InputStream input, long expected) throws Exception {
        try {
            BackupFileSizeVerifier.verify(input, expected);
            throw new AssertionError("Incomplete or unreadable backup was accepted.");
        } catch (IOException expectedFailure) { }
    }

    public static void main(String[] args) throws Exception {
        byte[] complete = new byte[64 * 1024 + 17];
        if (BackupFileSizeVerifier.verify(new ByteArrayInputStream(complete),
                complete.length) != complete.length) throw new AssertionError();
        reject(new ByteArrayInputStream(new byte[64 * 1024]), complete.length);
        reject(new ByteArrayInputStream(complete), 64 * 1024);
        reject(null, complete.length);
        reject(new ByteArrayInputStream(complete), 0);
        reject(new InputStream() {
            public int read() throws IOException { throw new IOException("Unreadable provider"); }
        }, complete.length);

        // File sizes above the signed-int range still use a 64 KiB buffer.
        final long largeSize = 4L * 1024 * 1024 * 1024 + 123;
        InputStream large = new InputStream() {
            long remaining = largeSize;
            public int read() { throw new UnsupportedOperationException(); }
            public int read(byte[] buffer, int offset, int length) {
                if (buffer.length > 64 * 1024) throw new AssertionError("Unbounded buffer");
                if (remaining == 0) return -1;
                int count = (int) Math.min(length, remaining);
                remaining -= count;
                return count;
            }
        };
        if (BackupFileSizeVerifier.verify(large, largeSize) != largeSize) throw new AssertionError();
        if (args.length > 0) {
            long expected = Files.size(Paths.get(args[0]));
            try (InputStream input = Files.newInputStream(Paths.get(args[0]))) {
                if (BackupFileSizeVerifier.verify(input, expected) != expected) throw new AssertionError();
            }
            System.out.println("Real exported file verified: " + expected + " bytes.");
        }
        System.out.println("Backup file-size verifier tests passed.");
    }
}

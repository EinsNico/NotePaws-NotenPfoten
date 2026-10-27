package de.nico.notenpfoten.screen;

import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONArray;

/** Window-only flag: no CPU wake lock, permission or background service. */
public class ScreenAwakePlugin extends CordovaPlugin {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private volatile boolean paused;
    private volatile boolean destroyed;
    private volatile int generation;

    @Override public boolean execute(String action, JSONArray args, CallbackContext callback) {
        if (!"setEnabled".equals(action)) return false;
        final boolean enabled = args.optBoolean(0, false);
        final int requestedGeneration = generation;
        handler.post(() -> {
            if (enabled && (paused || destroyed || requestedGeneration != generation)) {
                callback.error("Screen awake request cancelled");
                return;
            }
            try {
                if (enabled) cordova.getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else cordova.getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                callback.success();
            } catch (RuntimeException error) {
                callback.error("Screen awake unavailable");
            }
        });
        return true;
    }

    private void clear() {
        generation++;
        handler.post(() -> {
            try { cordova.getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); }
            catch (RuntimeException ignored) { /* Activity may already have been destroyed. */ }
        });
    }

    @Override public void onPause(boolean multitasking) { paused = true; clear(); }
    @Override public void onResume(boolean multitasking) { paused = false; }
    @Override public void onReset() { clear(); }
    @Override public void onDestroy() { destroyed = true; clear(); }
}

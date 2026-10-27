package de.nico.notenpfoten.audio;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Handler;
import android.os.Looper;
import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Arrays;

/** Detects the media route, not merely a list of connected headphones. */
public class AudioRoutePlugin extends CordovaPlugin {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private AudioManager manager;
    private AudioDeviceCallback deviceCallback;
    private CallbackContext watcher;
    private AudioTrack probe;
    private CallbackContext pendingRead;
    private String lastKey;
    private String inventory;
    private boolean inventoryChanged;
    private boolean paused;
    private int generation;

    @Override public boolean execute(String action, JSONArray args, CallbackContext callback) {
        if (!action.equals("watch") && !action.equals("unwatch") && !action.equals("getState")) return false;
        handler.post(() -> {
            if (manager == null) manager = (AudioManager) cordova.getActivity().getSystemService(Context.AUDIO_SERVICE);
            if (action.equals("unwatch")) {
                stopWatching(); callback.success();
            } else if (action.equals("watch")) {
                stopWatching(); watcher = callback; paused = false;
                if (manager == null) { callback.error("Audio output observation unavailable"); watcher = null; return; }
                inventory = outputInventory();
                deviceCallback = new AudioDeviceCallback() {
                    @Override public void onAudioDevicesAdded(AudioDeviceInfo[] devices) { checkInventory(); }
                    @Override public void onAudioDevicesRemoved(AudioDeviceInfo[] devices) { checkInventory(); }
                };
                manager.registerAudioDeviceCallback(deviceCallback, handler);
                scheduleProbe();
            } else {
                if (pendingRead != null) pendingRead.error("Audio output check superseded");
                pendingRead = callback;
                scheduleProbe();
            }
        });
        return true;
    }

    private String outputInventory() {
        if (manager == null) return "";
        AudioDeviceInfo[] devices = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
        String[] ids = new String[devices.length];
        for (int i = 0; i < devices.length; i++) ids[i] = devices[i].getType() + ":" + devices[i].getId();
        Arrays.sort(ids);
        return Arrays.toString(ids);
    }

    private void checkInventory() {
        // Inventory is only an invalidation signal if probing fails; it must
        // never be used to infer which connected device is actually playing.
        String current = outputInventory();
        if (inventory != null && !inventory.equals(current)) inventoryChanged = true;
        inventory = current;
        scheduleProbe();
    }

    private void scheduleProbe() {
        handler.removeCallbacks(beginProbe);
        if (paused) return;
        // Coalesce Android's initial inventory callbacks and unplug/plug bursts.
        handler.postDelayed(beginProbe, 150);
    }

    private final Runnable beginProbe = () -> {
        releaseProbe();
        final int run = generation;
        try {
            // A short, silent MEDIA track asks Android which output it actually
            // routed. No recording, focus request, output forcing or permissions.
            final int frames = 24000;
            probe = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                .setAudioFormat(new AudioFormat.Builder().setSampleRate(48000)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setBufferSizeInBytes(frames * 2).setTransferMode(AudioTrack.MODE_STATIC).build();
            if (probe.getState() != AudioTrack.STATE_INITIALIZED) throw new IllegalStateException();
            probe.write(new short[frames], 0, frames);
            probe.play();
            handler.postDelayed(() -> finishProbe(run), 220);
        } catch (RuntimeException error) {
            report(null); releaseProbe();
        }
    };

    private void finishProbe(int run) {
        if (generation != run || probe == null || paused) return;
        AudioDeviceInfo device = null;
        try { device = probe.getRoutedDevice(); } catch (RuntimeException ignored) { }
        report(device);
        releaseProbe();
    }

    private String category(int type) {
        switch (type) {
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER:
            case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE:
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE: return "speaker";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
            case AudioDeviceInfo.TYPE_USB_HEADSET:
            case AudioDeviceInfo.TYPE_BLE_HEADSET:
            case AudioDeviceInfo.TYPE_HEARING_AID: return "headphones";
            default: return "external";
        }
    }

    private void report(AudioDeviceInfo device) {
        try {
            // Android's session-local ID distinguishes two devices of the same
            // kind. No product names, Bluetooth addresses or identifiers leave
            // the local app. IDs changing after reboot safely invalidate a value.
            String key = device == null ? "unknown" : device.getType() + ":" + device.getId();
            JSONObject value = new JSONObject();
            value.put("route", device == null ? "unknown" : category(device.getType()));
            value.put("key", key);
            value.put("reliable", device != null);
            value.put("changed", (lastKey != null && !lastKey.equals(key)) || (device == null && inventoryChanged));
            lastKey = key;
            inventoryChanged = false;
            if (watcher != null) {
                PluginResult result = new PluginResult(PluginResult.Status.OK, value);
                result.setKeepCallback(true); watcher.sendPluginResult(result);
            }
            if (pendingRead != null) { pendingRead.success(value); pendingRead = null; }
        } catch (Exception ignored) {
            if (pendingRead != null) { pendingRead.error("Audio output unavailable"); pendingRead = null; }
        }
    }

    private void releaseProbe() {
        generation++;
        if (probe == null) return;
        try { probe.stop(); } catch (RuntimeException ignored) { }
        probe.release(); probe = null;
    }

    private void stopWatching() {
        handler.removeCallbacks(beginProbe); releaseProbe();
        if (manager != null && deviceCallback != null) manager.unregisterAudioDeviceCallback(deviceCallback);
        deviceCallback = null;
        if (watcher != null) {
            watcher.sendPluginResult(new PluginResult(PluginResult.Status.NO_RESULT)); watcher = null;
        }
        if (pendingRead != null) { pendingRead.error("Audio output check cancelled"); pendingRead = null; }
    }

    @Override public void onPause(boolean multitasking) {
        handler.post(() -> { paused = true; handler.removeCallbacks(beginProbe); releaseProbe(); });
    }
    @Override public void onResume(boolean multitasking) {
        handler.post(() -> { paused = false; if (watcher != null) scheduleProbe(); });
    }
    @Override public void onReset() { handler.post(this::stopWatching); }
    @Override public void onDestroy() { handler.post(this::stopWatching); }
}

// BetterSoundCloud's media helper (Windows only): the playback and volume shortcuts, done the way
// the system does them. Nothing is sent to SoundCloud's page.
//
// Playback presses the system media controls' buttons for our own media session, the one Chromium
// registers for SoundCloud's playback: Windows hands the press to Chromium as it would a press in
// its media flyout or a keyboard media key, and Chromium runs the page's own Media Session handler
// (SoundCloud registers play, pause, next and previous; measured 2026-11-15, each press 1 to 9ms).
// Our session is found by the app's ID (`app.setAppUserModelId`), so no other app's is touched.
//
// Volume changes BetterSoundCloud's own volume in the system mixer: the audio sessions belonging
// to our processes (Chromium plays sound from its audio service process, so main passes every pid
// it has), the same slider Windows' volume mixer shows for the app.
//
// Exports, each answering with a Promise and doing its work off the JavaScript thread:
//   press(appId, action)            action: 'playPause' | 'next' | 'previous'
//                                   -> 'done' | 'no-session' | 'refused' | 'failed'
//   volume(pids, action, step)      action: 'up' | 'down' | 'mute'; step: 0 to 1
//                                   -> { level, muted } of our sound, or null when we have none

#include <windows.h>
#include <mmdeviceapi.h>
#include <audiopolicy.h>
#include <node_api.h>

#include <winrt/base.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Media.Control.h>

#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

using winrt::Windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;

namespace {

// One call's work: what it asks, then what it found, between the worker thread and JavaScript.
struct Work {
  napi_async_work work = nullptr;
  napi_deferred deferred = nullptr;
  bool is_press = true;
  std::wstring app_id;
  std::string action;
  std::vector<DWORD> pids;
  float step = 0;
  // Answers.
  std::string press_result = "failed";
  bool found = false;
  float level = 0;
  bool muted = false;
};

// COM for this worker thread, multithreaded, for as long as the work runs. A pool thread may
// already have it, in which case it is left as it was.
class ComScope {
 public:
  ComScope() : ok_(SUCCEEDED(CoInitializeEx(nullptr, COINIT_MULTITHREADED))) {}
  ~ComScope() {
    if (ok_) CoUninitialize();
  }
  ComScope(const ComScope&) = delete;
  ComScope& operator=(const ComScope&) = delete;

 private:
  bool ok_;
};

void Press(Work& w) {
  ComScope com;
  try {
    auto manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync().get();
    for (auto const& session : manager.GetSessions()) {
      if (_wcsicmp(session.SourceAppUserModelId().c_str(), w.app_id.c_str()) != 0) continue;
      bool ok = false;
      if (w.action == "playPause") {
        ok = session.TryTogglePlayPauseAsync().get();
      } else if (w.action == "next") {
        ok = session.TrySkipNextAsync().get();
      } else if (w.action == "previous") {
        ok = session.TrySkipPreviousAsync().get();
      }
      w.press_result = ok ? "done" : "refused";
      return;
    }
    // Chromium registers the session once something has played in this launch.
    w.press_result = "no-session";
  } catch (...) {
    w.press_result = "failed";
  }
}

void Volume(Work& w) {
  ComScope com;
  try {
    auto devices_root = winrt::create_instance<IMMDeviceEnumerator>(__uuidof(MMDeviceEnumerator));
    winrt::com_ptr<IMMDeviceCollection> devices;
    winrt::check_hresult(
        devices_root->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, devices.put()));
    UINT device_count = 0;
    winrt::check_hresult(devices->GetCount(&device_count));

    // The first session of ours found decides the new level or mute, and every other session of
    // ours (another output device, another stream) is set to the same, so they never drift apart.
    for (UINT d = 0; d < device_count; ++d) {
      winrt::com_ptr<IMMDevice> device;
      if (FAILED(devices->Item(d, device.put()))) continue;
      winrt::com_ptr<IAudioSessionManager2> manager;
      if (FAILED(device->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, nullptr,
                                  manager.put_void()))) {
        continue;
      }
      winrt::com_ptr<IAudioSessionEnumerator> sessions;
      if (FAILED(manager->GetSessionEnumerator(sessions.put()))) continue;
      int session_count = 0;
      if (FAILED(sessions->GetCount(&session_count))) continue;

      for (int s = 0; s < session_count; ++s) {
        winrt::com_ptr<IAudioSessionControl> control;
        if (FAILED(sessions->GetSession(s, control.put()))) continue;
        auto control2 = control.try_as<IAudioSessionControl2>();
        if (!control2) continue;
        DWORD pid = 0;
        if (FAILED(control2->GetProcessId(&pid))) continue;
        if (std::find(w.pids.begin(), w.pids.end(), pid) == w.pids.end()) continue;
        auto volume = control.try_as<ISimpleAudioVolume>();
        if (!volume) continue;

        if (!w.found) {
          float now = 0;
          BOOL mute = FALSE;
          volume->GetMasterVolume(&now);
          volume->GetMute(&mute);
          w.found = true;
          w.level = now;
          w.muted = mute != FALSE;
          if (w.action == "mute") {
            w.muted = !w.muted;
          } else {
            const float change = w.action == "up" ? w.step : -w.step;
            // Kept on the step's grid, so ten presses up from 33% land on 85%, not 83%.
            const float target = std::round((now + change) / w.step) * w.step;
            w.level = std::clamp(target, 0.0f, 1.0f);
            // Turning it up unmutes it, as the system's own volume keys do.
            if (w.action == "up") w.muted = false;
          }
        }
        volume->SetMasterVolume(w.level, nullptr);
        volume->SetMute(w.muted ? TRUE : FALSE, nullptr);
      }
    }
  } catch (...) {
    w.found = false;
  }
}

void Execute(napi_env, void* data) {
  Work& w = *static_cast<Work*>(data);
  if (w.is_press) {
    Press(w);
  } else {
    Volume(w);
  }
}

void Complete(napi_env env, napi_status, void* data) {
  Work* w = static_cast<Work*>(data);
  napi_value result = nullptr;
  if (w->is_press) {
    napi_create_string_utf8(env, w->press_result.c_str(), NAPI_AUTO_LENGTH, &result);
  } else if (!w->found) {
    napi_get_null(env, &result);
  } else {
    napi_create_object(env, &result);
    napi_value level = nullptr;
    napi_value muted = nullptr;
    napi_create_double(env, w->level, &level);
    napi_get_boolean(env, w->muted, &muted);
    napi_set_named_property(env, result, "level", level);
    napi_set_named_property(env, result, "muted", muted);
  }
  napi_resolve_deferred(env, w->deferred, result);
  napi_delete_async_work(env, w->work);
  delete w;
}

std::string GetString(napi_env env, napi_value value) {
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok) return "";
  std::string out(length, '\0');
  napi_get_value_string_utf8(env, value, out.data(), length + 1, &length);
  return out;
}

std::wstring Wide(const std::string& text) {
  if (text.empty()) return L"";
  const int length = MultiByteToWideChar(CP_UTF8, 0, text.c_str(), -1, nullptr, 0);
  std::wstring out(static_cast<size_t>(length), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, text.c_str(), -1, out.data(), length);
  out.resize(static_cast<size_t>(length) - 1);
  return out;
}

// Queues the work and hands JavaScript its Promise.
napi_value Queue(napi_env env, Work* w, const char* name) {
  napi_value promise = nullptr;
  napi_value resource_name = nullptr;
  napi_create_promise(env, &w->deferred, &promise);
  napi_create_string_utf8(env, name, NAPI_AUTO_LENGTH, &resource_name);
  napi_create_async_work(env, nullptr, resource_name, Execute, Complete, w, &w->work);
  napi_queue_async_work(env, w->work);
  return promise;
}

napi_value PressExport(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2] = {nullptr, nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 2) {
    napi_throw_type_error(env, nullptr, "press(appId, action)");
    return nullptr;
  }
  auto* w = new Work();
  w->is_press = true;
  w->app_id = Wide(GetString(env, argv[0]));
  w->action = GetString(env, argv[1]);
  return Queue(env, w, "bsc.media.press");
}

napi_value VolumeExport(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3] = {nullptr, nullptr, nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  bool is_array = false;
  if (argc < 3 || napi_is_array(env, argv[0], &is_array) != napi_ok || !is_array) {
    napi_throw_type_error(env, nullptr, "volume(pids, action, step)");
    return nullptr;
  }
  auto* w = new Work();
  w->is_press = false;
  uint32_t count = 0;
  napi_get_array_length(env, argv[0], &count);
  for (uint32_t i = 0; i < count; ++i) {
    napi_value item = nullptr;
    uint32_t pid = 0;
    if (napi_get_element(env, argv[0], i, &item) == napi_ok &&
        napi_get_value_uint32(env, item, &pid) == napi_ok) {
      w->pids.push_back(pid);
    }
  }
  w->action = GetString(env, argv[1]);
  double step = 0;
  napi_get_value_double(env, argv[2], &step);
  w->step = static_cast<float>(std::clamp(step, 0.01, 1.0));
  return Queue(env, w, "bsc.media.volume");
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"press", nullptr, PressExport, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"volume", nullptr, VolumeExport, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 2, properties);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)

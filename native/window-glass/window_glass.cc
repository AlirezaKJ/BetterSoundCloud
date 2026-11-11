// BetterSoundCloud's window glass (Windows only): a live, blurred view of what is behind our
// window, drawn under our own views, in our own process. Nothing is injected anywhere.
//
// Why not Electron's `setBackgroundMaterial('acrylic' | 'mica')`: that is the DWM system
// backdrop, and DWM swaps it for a flat colour whenever the window is not the foreground window.
// DWM tracks that itself — answering WM_NCACTIVATE as "active" (to Chromium or straight to
// DefWindowProc) did not change it (measured 2026-11-10: the glass area went from a varied blur to
// one flat grey within a second of focusing another window, in all three variants). Mica also
// samples the static wallpaper rather than what is actually behind the window.
//
// What does stay live is a host backdrop brush (`ICompositor3::CreateHostBackdropBrush`), the
// brush Windows Settings uses. It is drawn by a system compositor visual tree attached to our
// window with `CreateDesktopWindowTarget(window, isTopmost = FALSE)`, which composites BELOW the
// window's own content: Chromium's transparent pixels show it, its opaque ones cover it. The tree
// is the backdrop with a tint over it. Windows only renders host backdrop brushes for a window
// that opts in with DWMWA_USE_HOSTBACKDROPBRUSH, and only the window's own process can set that.
//
// All composition work runs on one thread of our own, with its own DispatcherQueue and
// compositor, so Electron's main thread and its message loop are never involved beyond posting.
//
// Exports (all take `BaseWindow.getNativeWindowHandle()`):
//   enable(handle, tint): boolean   tint is 0xAARRGGBB over the backdrop; true once requested
//   setTint(handle, tint): boolean
//   disable(handle): boolean
//   status(): string                last result, for the dev log

#ifndef NOMINMAX
#define NOMINMAX
#endif
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <dwmapi.h>
#include <roapi.h>
#include <wrl.h>
#include <wrl/wrappers/corewrappers.h>
#include <DispatcherQueue.h>
#include <windows.ui.composition.h>
#include <windows.ui.composition.desktop.h>
#include <windows.ui.composition.interop.h>
#include <node_api.h>

#include <cstdio>
#include <map>
#include <mutex>
#include <string>

using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Wrappers::HStringReference;
using namespace ABI::Windows::UI::Composition;
using namespace ABI::Windows::UI::Composition::Desktop;

namespace {

// Thread messages to the composition thread. wParam is the window, lParam the tint.
constexpr UINT kAttach = WM_APP + 1;
constexpr UINT kTint = WM_APP + 2;
constexpr UINT kDetach = WM_APP + 3;

DWORD g_thread = 0;
INIT_ONCE g_start = INIT_ONCE_STATIC_INIT;

std::mutex g_statusLock;
std::string g_status = "not started";

void SetStatus(const char* what, HRESULT hr) {
  char text[160];
  snprintf(text, sizeof text, "%s 0x%08lX", what, static_cast<unsigned long>(hr));
  std::lock_guard<std::mutex> lock(g_statusLock);
  g_status = text;
}

// ── Composition thread only ──────────────────────────────────────────────────────────────
ComPtr<ABI::Windows::System::IDispatcherQueueController> g_queue;
ComPtr<ICompositor> g_compositor;

struct Glass {
  ComPtr<IDesktopWindowTarget> target;
  ComPtr<ICompositionColorBrush> tint;
};
std::map<HWND, Glass> g_glass;

ABI::Windows::UI::Color ToColor(UINT32 argb) {
  return {BYTE(argb >> 24), BYTE(argb >> 16), BYTE(argb >> 8), BYTE(argb)};
}

// A sprite filling its parent, painted with `brush`.
ComPtr<IVisual> Fill(ICompositionBrush* brush) {
  ComPtr<ISpriteVisual> sprite;
  if (FAILED(g_compositor->CreateSpriteVisual(&sprite))) return nullptr;
  sprite->put_Brush(brush);
  ComPtr<IVisual2> sized;
  if (SUCCEEDED(sprite.As(&sized))) sized->put_RelativeSizeAdjustment({1.f, 1.f});
  ComPtr<IVisual> visual;
  sprite.As(&visual);
  return visual;
}

void Attach(HWND window, UINT32 tint) {
  if (!g_compositor || !IsWindow(window)) return;
  if (g_glass.count(window)) {
    g_glass[window].tint->put_Color(ToColor(tint));
    return;
  }
  Glass glass;
  ComPtr<ICompositorDesktopInterop> interop;
  HRESULT hr = g_compositor.As(&interop);
  // FALSE: beneath the window's own content, so our views are drawn over the glass.
  if (SUCCEEDED(hr)) hr = interop->CreateDesktopWindowTarget(window, FALSE, &glass.target);
  if (FAILED(hr)) return SetStatus("target failed", hr);

  ComPtr<IContainerVisual> container;
  ComPtr<IVisualCollection> children;
  hr = g_compositor->CreateContainerVisual(&container);
  if (SUCCEEDED(hr)) hr = container->get_Children(&children);
  if (FAILED(hr)) return SetStatus("visuals failed", hr);
  ComPtr<IVisual2> containerSize;
  if (SUCCEEDED(container.As(&containerSize))) containerSize->put_RelativeSizeAdjustment({1.f, 1.f});

  ComPtr<ICompositor3> compositor3;
  ComPtr<ICompositionBackdropBrush> host;
  ComPtr<ICompositionBrush> hostBrush;
  hr = g_compositor.As(&compositor3);
  if (SUCCEEDED(hr)) hr = compositor3->CreateHostBackdropBrush(&host);
  if (SUCCEEDED(hr)) hr = host.As(&hostBrush);
  if (FAILED(hr)) return SetStatus("host backdrop failed", hr);
  if (auto visual = Fill(hostBrush.Get())) children->InsertAtTop(visual.Get());

  ComPtr<ICompositionBrush> tintBrush;
  hr = g_compositor->CreateColorBrushWithColor(ToColor(tint), &glass.tint);
  if (SUCCEEDED(hr)) hr = glass.tint.As(&tintBrush);
  if (FAILED(hr)) return SetStatus("tint failed", hr);
  if (auto visual = Fill(tintBrush.Get())) children->InsertAtTop(visual.Get());

  ComPtr<ICompositionTarget> target;
  ComPtr<IVisual> root;
  hr = glass.target.As(&target);
  if (SUCCEEDED(hr)) hr = container.As(&root);
  if (SUCCEEDED(hr)) hr = target->put_Root(root.Get());
  if (FAILED(hr)) return SetStatus("root failed", hr);
  g_glass[window] = std::move(glass);
  SetStatus("glass on", S_OK);
}

void Detach(HWND window) {
  const auto it = g_glass.find(window);
  if (it == g_glass.end()) return;
  ComPtr<ICompositionTarget> target;
  if (SUCCEEDED(it->second.target.As(&target))) target->put_Root(nullptr);
  g_glass.erase(it);
  SetStatus("glass off", S_OK);
}

DWORD WINAPI CompositionThread(void* ready) {
  RoInitialize(RO_INIT_SINGLETHREADED);
  MSG message;
  // Make this thread's message queue before anyone posts to it.
  PeekMessageW(&message, nullptr, 0, 0, PM_NOREMOVE);
  const DispatcherQueueOptions options{sizeof(DispatcherQueueOptions), DQTYPE_THREAD_CURRENT,
                                       DQTAT_COM_STA};
  HRESULT hr = CreateDispatcherQueueController(
      options, reinterpret_cast<PDISPATCHERQUEUECONTROLLER*>(g_queue.ReleaseAndGetAddressOf()));
  ComPtr<IInspectable> instance;
  if (SUCCEEDED(hr)) {
    hr = RoActivateInstance(
        HStringReference(RuntimeClass_Windows_UI_Composition_Compositor).Get(), &instance);
  }
  if (SUCCEEDED(hr)) hr = instance.As(&g_compositor);
  SetStatus(SUCCEEDED(hr) ? "compositor ready" : "compositor failed", hr);
  SetEvent(static_cast<HANDLE>(ready));

  while (GetMessageW(&message, nullptr, 0, 0) > 0) {
    const HWND window = reinterpret_cast<HWND>(message.wParam);
    const UINT32 tint = static_cast<UINT32>(message.lParam);
    if (!message.hwnd && (message.message == kAttach || message.message == kTint)) {
      Attach(window, tint);
    } else if (!message.hwnd && message.message == kDetach) {
      Detach(window);
    }
    TranslateMessage(&message);
    DispatchMessageW(&message);
  }
  return 0;
}

BOOL CALLBACK StartThread(PINIT_ONCE, PVOID, PVOID*) {
  const HANDLE ready = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (!ready) return FALSE;
  if (const HANDLE thread = CreateThread(nullptr, 0, CompositionThread, ready, 0, &g_thread)) {
    WaitForSingleObject(ready, 5000);
    CloseHandle(thread);
  }
  CloseHandle(ready);
  return g_thread != 0;
}

// ── Node-API ───────────────────────────────────────────────────────────────────────────────

napi_value Boolean(napi_env env, bool value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  return result;
}

// Reads (handle[, tint]). Throws and returns false on bad arguments.
bool ReadArgs(napi_env env, napi_callback_info info, HWND* window, UINT32* tint) {
  size_t argc = 2;
  napi_value argv[2];
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok || argc < 1) {
    napi_throw_type_error(env, nullptr, "expected getNativeWindowHandle()'s Buffer");
    return false;
  }
  void* data = nullptr;
  size_t length = 0;
  bool isBuffer = false;
  napi_is_buffer(env, argv[0], &isBuffer);
  if (!isBuffer || napi_get_buffer_info(env, argv[0], &data, &length) != napi_ok ||
      length < sizeof(HWND)) {
    napi_throw_type_error(env, nullptr, "expected getNativeWindowHandle()'s Buffer");
    return false;
  }
  memcpy(window, data, sizeof(HWND));
  if (tint) {
    if (argc < 2 || napi_get_value_uint32(env, argv[1], tint) != napi_ok) {
      napi_throw_type_error(env, nullptr, "tint must be a 0xAARRGGBB number");
      return false;
    }
  }
  // Only a window of this process: the opt-in below is refused for anyone else's anyway.
  DWORD process = 0;
  GetWindowThreadProcessId(*window, &process);
  return IsWindow(*window) && process == GetCurrentProcessId();
}

napi_value Enable(napi_env env, napi_callback_info info) {
  HWND window = nullptr;
  UINT32 tint = 0;
  if (!ReadArgs(env, info, &window, &tint)) return Boolean(env, false);
  // The host backdrop renders only for a window that opts in, and only its own process can.
  const BOOL on = TRUE;
  const HRESULT hr = DwmSetWindowAttribute(window, DWMWA_USE_HOSTBACKDROPBRUSH, &on, sizeof on);
  if (FAILED(hr)) {
    SetStatus("opt-in failed", hr);
    return Boolean(env, false);
  }
  if (!InitOnceExecuteOnce(&g_start, StartThread, nullptr, nullptr) || !g_thread) {
    return Boolean(env, false);
  }
  return Boolean(env, PostThreadMessageW(g_thread, kAttach, reinterpret_cast<WPARAM>(window),
                                         static_cast<LPARAM>(tint)) != FALSE);
}

napi_value SetTint(napi_env env, napi_callback_info info) {
  HWND window = nullptr;
  UINT32 tint = 0;
  if (!ReadArgs(env, info, &window, &tint) || !g_thread) return Boolean(env, false);
  return Boolean(env, PostThreadMessageW(g_thread, kTint, reinterpret_cast<WPARAM>(window),
                                         static_cast<LPARAM>(tint)) != FALSE);
}

napi_value Disable(napi_env env, napi_callback_info info) {
  HWND window = nullptr;
  if (!ReadArgs(env, info, &window, nullptr)) return Boolean(env, false);
  if (g_thread) PostThreadMessageW(g_thread, kDetach, reinterpret_cast<WPARAM>(window), 0);
  const BOOL off = FALSE;
  DwmSetWindowAttribute(window, DWMWA_USE_HOSTBACKDROPBRUSH, &off, sizeof off);
  return Boolean(env, true);
}

napi_value Status(napi_env env, napi_callback_info) {
  std::lock_guard<std::mutex> lock(g_statusLock);
  napi_value result;
  napi_create_string_utf8(env, g_status.c_str(), g_status.size(), &result);
  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  const struct {
    const char* name;
    napi_callback fn;
  } methods[] = {{"enable", Enable}, {"setTint", SetTint}, {"disable", Disable}, {"status", Status}};
  for (const auto& m : methods) {
    napi_value fn;
    napi_create_function(env, m.name, NAPI_AUTO_LENGTH, m.fn, nullptr, &fn);
    napi_set_named_property(env, exports, m.name, fn);
  }
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)

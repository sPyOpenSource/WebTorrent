type LoaderStatus = "IDLE" | "LOADING" | "LOADED" | "FAILED";

const CDN_URLS = [
  "https://cdn.jsdelivr.net/npm/webtorrent@1/webtorrent.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/webtorrent/1.24.1/webtorrent.min.js",
  "https://unpkg.com/webtorrent@1.24.1/dist/webtorrent.min.js",
  "https://cdn.jsdelivr.net/npm/webtorrent@1.18.0/webtorrent.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/webtorrent/1.18.0/webtorrent.min.js"
];

let currentStatus: LoaderStatus = "IDLE";
let currentCdnIndex = 0;
let activePromise: Promise<any> | null = null;
const listeners = new Set<(status: LoaderStatus, errorMsg?: string, activeUrl?: string) => void>();
let errorMessage = "";
let activeCdnUrl = "";

export function getStatus() {
  if (typeof window !== "undefined" && (window as any).WebTorrent) {
    return "LOADED";
  }
  return currentStatus;
}

export function getErrorMessage() {
  return errorMessage;
}

export function getActiveCdnUrl() {
  return activeCdnUrl || (CDN_URLS[currentCdnIndex] || "");
}

export function subscribeToLoader(listener: (status: LoaderStatus, errorMsg?: string, activeUrl?: string) => void) {
  listeners.add(listener);
  // Send current state on sub
  listener(getStatus(), errorMessage, getActiveCdnUrl());
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  const status = getStatus();
  listeners.forEach(l => l(status, errorMessage, getActiveCdnUrl()));
}

export function loadWebTorrent(forceReset = false): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Cannot load WebTorrent SDK on server-side"));
  }

  if ((window as any).WebTorrent) {
    currentStatus = "LOADED";
    notifyListeners();
    return Promise.resolve((window as any).WebTorrent);
  }

  if (activePromise && !forceReset) {
    return activePromise;
  }

  if (forceReset) {
    currentCdnIndex = 0;
    // Remove existing scripts if we can find them
    const scripts = document.querySelectorAll('script[src*="webtorrent"]');
    scripts.forEach(s => s.parentNode?.removeChild(s));
  }

  currentStatus = "LOADING";
  errorMessage = "";
  notifyListeners();

  const tryLoadCDN = (index: number): Promise<any> => {
    if (index >= CDN_URLS.length) {
      currentStatus = "FAILED";
      errorMessage = "All WebTorrent CDN mirrors failed to respond. Please verify your internet connection or inspect browser console and Content Security Policies.";
      notifyListeners();
      return Promise.reject(new Error(errorMessage));
    }

    const url = CDN_URLS[index];
    activeCdnUrl = url;
    currentCdnIndex = index;
    notifyListeners();

    console.log(`[WebTorrent SDK Loader] Instantiating connection to: ${url}`);

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.crossOrigin = "anonymous";

      script.onload = () => {
        if ((window as any).WebTorrent) {
          console.log(`[WebTorrent SDK Loader] Successfully finalized load with: ${url}`);
          currentStatus = "LOADED";
          errorMessage = "";
          notifyListeners();
          resolve((window as any).WebTorrent);
        } else {
          // Script loaded but class is not present on window, treat as failure
          script.parentNode?.removeChild(script);
          tryLoadCDN(index + 1).then(resolve, reject);
        }
      };

      script.onerror = (err) => {
        console.warn(`[WebTorrent SDK Loader] Failed to reach or retrieve script: ${url}`, err);
        script.parentNode?.removeChild(script);
        tryLoadCDN(index + 1).then(resolve, reject);
      };

      document.body.appendChild(script);
    });
  };

  activePromise = tryLoadCDN(currentCdnIndex).finally(() => {
    activePromise = null;
  });

  return activePromise;
}

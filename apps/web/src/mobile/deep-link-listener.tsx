import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { mapDeepLinkToAppPath } from "@/lib/mobile/auth-callback";
import { getNativeBridge } from "@/lib/mobile/native-bridge";
import { isCapacitorNative, readMobileRuntimeConfig } from "@/lib/mobile/runtime";

export function MobileDeepLinkListener() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isCapacitorNative()) return;

    const bridge = getNativeBridge();
    if (!bridge) return;

    const config = readMobileRuntimeConfig();
    return bridge.addDeepLinkListener((url) => {
      const path = mapDeepLinkToAppPath(url, config);
      if (path) {
        navigate(path, { replace: true });
      }
    });
  }, [navigate]);

  return null;
}

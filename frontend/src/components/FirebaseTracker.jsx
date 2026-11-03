import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { trackEvent } from "../lib/firebase";
import { api } from "../lib/api";
import { isNativeApp } from "../lib/native";

const screenName = (p) => p.replace(/\/(proj|kit|job)_[\w-]+/g, "/:id").replace(/^\/$/, "/home");

export const FirebaseTracker = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => { trackEvent("screen_view", { firebase_screen: screenName(pathname), firebase_screen_class: "web" }); }, [pathname]);
  useEffect(() => {
    if (!isNativeApp() || !localStorage.getItem("cinereel_token")) return;
    let off = [];
    (async () => {
      const { PushNotifications: P } = await import("@capacitor/push-notifications");
      if ((await P.requestPermissions()).receive !== "granted") return;
      off.push(await P.addListener("registration", ({ value }) => api.post("/push/register", { token: value }).catch(() => {})));
      off.push(await P.addListener("pushNotificationActionPerformed", (a) => a.notification?.data?.route && navigate(a.notification.data.route)));
      await P.register();
    })().catch(() => {});
    return () => off.forEach((h) => h.remove());
  }, [pathname.startsWith("/dashboard")]); // eslint-disable-line
  return null;
};

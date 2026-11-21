import { beforeEach, describe, expect, it } from "vitest";
import {
  clearNotificationHistory,
  getNotificationHistory,
  getNotificationPrefs,
  notifyOs,
  setNotificationPrefs,
} from "./settings";

describe("notification settings", () => {
  beforeEach(() => {
    clearNotificationHistory();
    setNotificationPrefs({ enabled: true, sound: true });
  });

  it("met à jour les préférences de notifications", () => {
    expect(getNotificationPrefs()).toEqual({ enabled: true, sound: true });
    setNotificationPrefs({ enabled: false, sound: true });
    expect(getNotificationPrefs()).toEqual({ enabled: false, sound: true });
    setNotificationPrefs({ enabled: true, sound: false });
    expect(getNotificationPrefs()).toEqual({ enabled: true, sound: false });
  });

  it("enregistre ou ignore notifyOs selon les préférences", () => {
    setNotificationPrefs({ enabled: false, sound: true });
    notifyOs("Fil 1", "Ignoré");
    expect(getNotificationHistory()).toHaveLength(0);

    setNotificationPrefs({ enabled: true, sound: false });
    notifyOs("Fil 2", "Terminé");
    expect(getNotificationHistory()).toHaveLength(1);
    expect(getNotificationHistory()[0]).toMatchObject({
      title: "Fil 2",
      body: "Terminé",
      sound: false,
    });
  });
});

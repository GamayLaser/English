export function getTranslatorVisibility(webPage: string, activeMobilePage: string) {
  return { desktop: webPage === "english", mobile: activeMobilePage === "english" };
}

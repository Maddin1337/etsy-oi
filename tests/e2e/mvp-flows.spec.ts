import { expect, test } from "@playwright/test";

test("Suchbegriff-Analyse kann gestartet werden und liefert ein Ergebnis mit Score", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /starte eine fokussierte etsy-chancenanalyse/i })).toBeVisible();
  await expect(page.getByLabel("Statusvorschau der Analyse").getByText("In Warteschlange")).toBeVisible();
  await expect(page.getByLabel("Statusvorschau der Analyse").getByText("Fehlgeschlagen")).toBeVisible();
  await expect(page.getByLabel("Statusvorschau der Analyse").getByText("Veraltet")).toBeVisible();

  await page.getByLabel("Suchbegriff").fill("mid century wandkunst");
  await page.getByRole("button", { name: "Suchbegriff-Analyse starten" }).click();

  await expect(page).toHaveURL(/\/analyses\/an_/);
  await expect(page.getByLabel("Analyse-Status").getByRole("heading", { name: "Abgeschlossen" })).toBeVisible();
  await expect(page.getByLabel("Analyseergebnis").getByText("Chancen-Score")).toBeVisible();
  await expect(page.getByRole("heading", { name: "mid century wandkunst" })).toBeVisible();
  await expect(page.getByText("Mid-Century-Wandkunst-Print")).toBeVisible();
});

test("Listing-Analyse kann gestartet werden und rendert Snapshot-Details", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("tab", { name: "Listing-Analyse" }).click();
  await page.getByLabel("Etsy-Listing-URL").fill("https://www.etsy.com/listing/1234567890/example?utm_source=test");
  await page.getByRole("button", { name: "Listing-Analyse starten" }).click();

  await expect(page).toHaveURL(/\/analyses\/an_/);
  await expect(page.getByLabel("Analyse-Status").getByRole("heading", { name: "Abgeschlossen" })).toBeVisible();
  await expect(page.getByLabel("Capture-Jobs").getByRole("heading", { name: "Capture-Jobs" })).toBeVisible();
  await expect(page.getByLabel("Capture-Jobs").getByText("Erstlauf")).toBeVisible();
  await expect(page.getByLabel("Capture-Jobs").getByText("collector-listing")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Personalisierte Geburtsblumen-Halskette" })).toBeVisible();
  await expect(page.getByText("32.50")).toBeVisible();
  await expect(page.getByText("personalisierte halskette")).toBeVisible();
});

test("Listing-Formular zeigt API-Validierungsfehler bei ungültiger Eingabe", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("tab", { name: "Listing-Analyse" }).click();
  await page.getByLabel("Etsy-Listing-URL").fill("https://example.com/listing/1234567890/not-etsy");
  await page.getByRole("button", { name: "Listing-Analyse starten" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText("Die Anfrage entspricht nicht dem v1-Vertrag.")).toBeVisible();
});

test("Analyse-Detail kann aktualisiert werden und zurück zum Dashboard navigieren", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Suchbegriff").fill("aktualisierung wandkunst");
  await page.getByRole("button", { name: "Suchbegriff-Analyse starten" }).click();
  await expect(page.getByLabel("Analyse-Status").getByRole("heading", { name: "Abgeschlossen" })).toBeVisible();

  await page.getByRole("button", { name: "Ergebnis aktualisieren" }).click();
  await expect(page).toHaveURL(/\/analyses\/an_/);
  await expect(page.getByLabel("Analyse-Status").getByRole("heading", { name: "Abgeschlossen" })).toBeVisible();

  await page.getByRole("button", { name: "Zurück zu den Analyseformularen" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: /starte eine fokussierte etsy-chancenanalyse/i })).toBeVisible();
});

test("Dashboard zeigt letzte Analysen, filtert sie und öffnet sie erneut", async ({ page }) => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const keywordTerm = `retro poster set ${uniqueSuffix}`;
  const listingId = `1234${uniqueSuffix}`;

  await page.goto("/");

  await page.getByLabel("Suchbegriff").fill(keywordTerm);
  await page.getByRole("button", { name: "Suchbegriff-Analyse starten" }).click();
  await expect(page).toHaveURL(/\/analyses\/an_/);
  const keywordAnalysisUrl = page.url();
  const keywordAnalysisId = keywordAnalysisUrl.split("/").pop() ?? "";

  await page.getByRole("button", { name: "Zurück zu den Analyseformularen" }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("tab", { name: "Listing-Analyse" }).click();
  await page.getByLabel("Etsy-Listing-URL").fill(`https://www.etsy.com/listing/${listingId}/example?utm_source=history-test`);
  await page.getByRole("button", { name: "Listing-Analyse starten" }).click();
  await expect(page).toHaveURL(/\/analyses\/an_/);
  const listingAnalysisUrl = page.url();
  const listingAnalysisId = listingAnalysisUrl.split("/").pop() ?? "";

  await page.getByRole("button", { name: "Zurück zu den Analyseformularen" }).click();
  await expect(page).toHaveURL("/");

  const recentAnalyses = page.getByLabel("Letzte Analysen");
  await expect(recentAnalyses.getByText(keywordAnalysisId, { exact: true })).toBeVisible();
  await expect(recentAnalyses.getByText(listingAnalysisId, { exact: true })).toBeVisible();

  await recentAnalyses.getByRole("button", { name: "Nur Keyword" }).click();
  await expect(recentAnalyses.getByText(keywordAnalysisId, { exact: true })).toBeVisible();
  await expect(recentAnalyses.getByText(listingAnalysisId, { exact: true })).toHaveCount(0);

  await recentAnalyses.getByRole("button", { name: "Nur Listing" }).click();
  await expect(recentAnalyses.getByText(listingAnalysisId, { exact: true })).toBeVisible();
  await expect(recentAnalyses.getByText(keywordAnalysisId, { exact: true })).toHaveCount(0);
  await recentAnalyses.getByRole("link", { name: new RegExp(`Listing-Analyse\\s+${listingAnalysisId}`) }).click();
  await expect(page).toHaveURL(listingAnalysisUrl);
  await expect(page.getByLabel("Analyse-Status").getByRole("heading", { name: "Abgeschlossen" })).toBeVisible();

  await page.getByRole("button", { name: "Zurück zu den Analyseformularen" }).click();
  await recentAnalyses.getByRole("button", { name: "Alle" }).click();
  await recentAnalyses.getByRole("link", { name: new RegExp(`Keyword-Analyse\\s+${keywordAnalysisId}`) }).click();
  await expect(page).toHaveURL(keywordAnalysisUrl);
});

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

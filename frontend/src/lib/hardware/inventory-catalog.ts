export type CatalogItem = {
  id: string;
  name: string;
  quantity: number;
  brand: string | null;
  size: string | null;
  imageUrl: string | null;
  imageSource: string | null;
  imageMatch: string;
  category: string;
  expiresAt: string | null;
  updatedAt: string;
  observed: number | null;
};
export type ShelfCheck = {
  id: string;
  at: string;
  status: string;
  headline: string;
  observed: { name: string; count: number }[];
  thumbnail: string | null;
};
export type InventoryCatalog = {
  fridges: { id: string; name: string }[];
  fridge: { id: string; name: string };
  items: CatalogItem[];
  checks: ShelfCheck[];
  scans: { id: string; at: string; name: string }[];
  evaluatedAt: string;
  analyzedAt: string | null;
};
type Raw = Record<string, unknown>;
function record(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Raw)
    : {};
}
function text(value: unknown) {
  return typeof value === "string" ? value : null;
}
export function httpsUrl(value: unknown) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
export function cleanCatalog(
  raw: {
    fridge: { id: string; name: string };
    items: Raw[];
    audits: Raw[];
    scans: Raw[];
  },
  operator = false,
) {
  const checks: ShelfCheck[] = raw.audits.map((a) => {
    const result = record(a.result),
      thumb = record(result.shelf_thumbnail);
    const observed = Array.isArray(result.observed_items)
      ? result.observed_items
          .map(record)
          .filter(
            (i) =>
              typeof i.name === "string" &&
              Number.isInteger(i.count) &&
              Number(i.count) >= 0,
          )
          .map((i) => ({ name: String(i.name), count: Number(i.count) }))
      : [];
    const bytes = text(thumb.data_base64);
    return {
      id: String(a.id),
      at: String(a.captured_at),
      status: text(result.status) ?? String(a.image_quality),
      headline: text(result.headline) ?? "Shelf observation recorded",
      observed,
      thumbnail:
        operator &&
        thumb.mime_type === "image/jpeg" &&
        bytes &&
        bytes.length < 120000 &&
        /^[A-Za-z0-9+/=]+$/.test(bytes)
          ? `data:image/jpeg;base64,${bytes}`
          : null,
    };
  });
  const latest = raw.audits.find((a) =>
    ["ok", "discrepancy"].includes(String(record(a.result).status)),
  );
  const result = record(latest?.result);
  const observed = checks.find((c) => c.id === latest?.id)?.observed ?? [];
  const missing = Array.isArray(result.missing)
    ? result.missing.map(record)
    : [];
  const items: CatalogItem[] = raw.items.map((p) => {
    const details = record(record(p.metadata).vision_details);
    const same = observed.find(
      (o) => o.name.toLowerCase() === String(p.canonical_name).toLowerCase(),
    );
    const miss = missing.find(
      (o) =>
        String(o.name).toLowerCase() === String(p.canonical_name).toLowerCase(),
    );
    const expiry = text(details.expires_at ?? details.expiration_date);
    return {
      id: String(p.product_id),
      name: String(p.canonical_name),
      quantity: Number(p.recorded_quantity),
      brand: text(p.brand),
      size: text(p.package_size),
      imageUrl: httpsUrl(p.display_image_url),
      imageSource: httpsUrl(p.image_source_url),
      imageMatch:
        p.match_method === "barcode"
          ? "Barcode matched"
          : record(details.catalog_photo).verdict === "same"
            ? "Visually matched"
            : "Catalog suggestion",
      category: text(details.category) ?? "Food",
      expiresAt:
        expiry &&
        /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(expiry) &&
        Number.isFinite(Date.parse(expiry))
          ? expiry
          : null,
      updatedAt: String(p.last_event_at),
      observed:
        same?.count ??
        (Number.isInteger(miss?.seen) ? Number(miss?.seen) : null),
    };
  });
  const scans = raw.scans.map((s) => {
    const p = record(record(s.result).product),
      c = record(p.catalog);
    return {
      id: String(s.id),
      at: String(s.captured_at),
      name:
        text(p.product_name) ??
        text(c.name) ??
        text(p.object_seen) ??
        "Item identification",
    };
  });
  return {
    fridge: raw.fridge,
    items,
    checks,
    scans,
    analyzedAt: latest ? String(latest.captured_at) : null,
  };
}

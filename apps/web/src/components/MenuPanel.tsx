import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, UploadSimple, Check } from "@phosphor-icons/react";
import { toast } from "sonner";
import { makeId, type TripState, type TripItem } from "@whereto/shared";
import { api } from "../lib/api";
import { Modal, Field, Button, Notice } from "./ui";
export default function MenuPanel({
  state,
  tripId,
  item,
  onClose,
  onSave,
  demo = false,
}: {
  state: TripState;
  tripId: string;
  item: TripItem;
  onClose: () => void;
  onSave: (item: TripItem) => Promise<void>;
  demo?: boolean;
}) {
  const query = useQueryClient();
  const [url, setUrl] = useState(item.bookingUrl),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [quantities, setQuantities] = useState<Record<string, number>>({}),
    [prices, setPrices] = useState<Record<string, string>>({}),
    [currency, setCurrency] = useState(state.currency),
    [rate, setRate] = useState("1"),
    [confirmed, setConfirmed] = useState(false),
    [permission, setPermission] = useState(false);
  const [selectedMenuId, setSelectedMenuId] = useState(item.menuId);
  const menus = useQuery({
    queryKey: ["menus", tripId],
    queryFn: () => api(`/trips/${tripId}/menus`),
    enabled: !demo,
  });
  const jobs = useQuery({
    queryKey: ["menu-jobs", tripId],
    queryFn: () => api<any[]>(`/trips/${tripId}/jobs`),
    enabled: !demo,
    refetchInterval: 3000,
  });
  const menu = menus.data?.menus.find(
    (m: any) =>
      m.id === selectedMenuId ||
      m.itemId === item.id ||
      (!!url && m.source === url),
  );
  useEffect(() => {
    if (!menu) return;
    const currencies = [
      ...new Set(menu.data.dishes.map((d: any) => d.currency).filter(Boolean)),
    ];
    if (currencies.length === 1) {
      setCurrency(String(currencies[0]));
      setRate(currencies[0] === state.currency ? "1" : "");
    }
    setConfirmed(false);
  }, [menu?.id]);
  async function importMenu() {
    if (demo) {
      toast.info("Use your own trip to import real restaurant menus.");
      return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      data.append("itemId", item.id);
      if (file) data.append("file", file);
      else data.append("url", url);
      const result = await api(`/trips/${tripId}/menus/import`, {
        method: "POST",
        body: data,
      });
      if (result.menu?.id) setSelectedMenuId(result.menu.id);
      await query.invalidateQueries({ queryKey: ["menu-jobs", tripId] });
      await query.invalidateQueries({ queryKey: ["menus", tripId] });
      toast.success("Menu added to the import queue.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function addMeal() {
    setBusy(true);
    try {
      const selected = menu.data.dishes.filter(
        (d: any) => (quantities[d.id] ?? 0) > 0,
      );
      if (!selected.length) throw new Error("Choose at least one dish.");
      if (selected.some((d: any) => (prices[d.id] ?? d.price) == null))
        throw new Error("Confirm a price for each selected dish.");
      const updated = {
        ...item,
        menuId: menu.id,
        lines: selected.map((d: any) => ({
          id: makeId(),
          label: d.english,
          unit: "item" as const,
          price: prices[d.id] ?? d.price,
          quantity: String(quantities[d.id]),
          multiplier: "1",
          currency,
          rate,
          rateDate: new Date().toISOString().slice(0, 10),
          status: "estimated" as const,
        })),
      };
      await onSave(updated);
      toast.success("Meal estimate added. Your budget is up to date.");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="A taste of somewhere new."
      description={item.title}
      wide
    >
      <div className="menu-panel">
        <Notice>
          Menu imports: {demo ? "10" : (menus.data?.allowance.remaining ?? "…")}{" "}
          remaining{" "}
          {menus.data?.allowance.pro ? "this month" : "for your first trip"}.
          Failed imports don’t count.
        </Notice>
        {!menu ? (
          <>
            <p className="muted">
              Start with the official restaurant menu, or upload a clear photo.
              You’ll review the translated dishes and prices before adding any
              costs.
            </p>
            <Field label="Official menu URL">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://restaurant.com/menu"
              />
            </Field>
            <label className="upload-zone">
              <UploadSimple size={24} />
              <span>{file?.name ?? "Or choose a menu photo / PDF"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <small className="muted">
              Up to 10 MB / 10 PDF pages. Clear photos work best.
            </small>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={permission}
                onChange={(e) => setPermission(e.target.checked)}
              />{" "}
              I can use this menu source for my personal trip planning.
            </label>
            <Button
              loading={busy}
              disabled={!permission || (!url && !file)}
              onClick={() => void importMenu()}
            >
              Import & translate to English <ArrowUpRight size={18} />
            </Button>
            {url && (
              <a
                className="text-link"
                href={/^https?:\/\//i.test(url) ? url : undefined}
                target="_blank"
                rel="noreferrer"
              >
                Open the original menu <ArrowUpRight size={16} />
              </a>
            )}
          </>
        ) : (
          <>
            <p className="menu-source">
              Imported {new Date(menu.createdAt).toLocaleDateString()} ·{" "}
              {menu.source}
              <br />
              Prices are estimates, not guaranteed current prices.
            </p>
            {menu.data.warnings?.map((w: string, i: number) => (
              <Notice key={i}>{w}</Notice>
            ))}
            <div className="form-grid">
              <Field label="Confirm menu currency">
                <input
                  value={currency}
                  maxLength={3}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                />
              </Field>
              {currency !== state.currency && (
                <Field label={`1 ${currency} = ${state.currency}`}>
                  <input
                    type="number"
                    step="any"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  />
                </Field>
              )}
            </div>
            <div className="menu-dishes">
              {menu.data.dishes.map((dish: any) => (
                <div className="dish" key={dish.id}>
                  <div>
                    <small>
                      {dish.section} {dish.variant}
                    </small>
                    <strong>{dish.english}</strong>
                    <span>{dish.original}</span>
                    <p>{dish.description}</p>
                    {dish.needsReview && (
                      <small className="review-label">
                        Please verify against the original menu
                      </small>
                    )}
                  </div>
                  <Field label="Price">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Confirm"
                      value={prices[dish.id] ?? dish.price ?? ""}
                      onChange={(e) =>
                        setPrices({ ...prices, [dish.id]: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Qty">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={quantities[dish.id] ?? 0}
                      onChange={(e) =>
                        setQuantities({
                          ...quantities,
                          [dish.id]: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                </div>
              ))}
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              I’ve checked the selected prices, currency and quantities. Replace
              this meal’s current estimate.
            </label>
            <Button
              disabled={!confirmed}
              loading={busy}
              onClick={() => void addMeal()}
            >
              <Check size={18} /> Add the meal estimate
            </Button>
            <p className="fine-print">
              This creates a budget estimate, not a restaurant order.
            </p>
          </>
        )}
        {jobs.data
          ?.filter((j) => j.type === "menu")
          .slice(0, 3)
          .map((job) => (
            <div className="job-row" key={job.id}>
              <div>
                <strong>
                  {job.status === "completed"
                    ? "Menu ready"
                    : job.status === "failed"
                      ? "Needs another look"
                      : job.status === "waiting"
                        ? "Waiting for the free AI allowance"
                        : "Reading your menu…"}
                </strong>
                {job.error && <p>{job.error}</p>}
              </div>
              {job.status === "completed" && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    void query.invalidateQueries({
                      queryKey: ["menus", tripId],
                    })
                  }
                >
                  View menu
                </Button>
              )}
            </div>
          ))}
      </div>
    </Modal>
  );
}

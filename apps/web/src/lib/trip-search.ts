import type { TripItem } from "@whereto/shared";

type SearchableTripItem = Pick<
  TripItem,
  "title" | "location" | "category" | "receipt" | "deletedAt"
>;

export function searchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

export function tripSearchCategories(
  item: Pick<TripItem, "category" | "receipt">,
) {
  return [...new Set([item.category, ...(item.receipt ? ["Receipt"] : [])])];
}

export function matchesTripSearch(item: SearchableTripItem, query: string) {
  if (item.deletedAt) return false;
  const categories = tripSearchCategories(item);
  const searchableText = [
    item.title,
    item.location?.name ?? "",
    ...categories,
    ...(item.receipt ? ["Receipts"] : []),
  ].join(" ");
  return searchText(searchableText).includes(searchText(query));
}

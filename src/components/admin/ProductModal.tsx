import { useState, useEffect } from "react";
import { logger } from "../../lib/logger";
import { Button, buttonVariants } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Badge } from "../ui/badge";
import { Loading } from "../ui/loading";
import type { Product, Category, VariantAxis, ProductVideo } from "../../types";
import {
  createProduct,
  updateProduct,
  uploadProductImages,
  uploadProductMedia,
  uploadProductVideo,
  createCategory,
  updateCategory,
  deleteCategory,
  replaceProductVariants,
  MAX_PRODUCT_IMAGES,
  MAX_VARIANT_IMAGES,
  MAX_PRODUCT_CATEGORIES,
  type ProductInput,
  type VariantInput,
} from "../../lib/products";
import {
  prepareProductImages,
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_ACCEPT_LABEL,
} from "../../lib/product-image";
import {
  parseVideoUrl,
  videoKindLabel,
  videoThumbnail,
  MAX_PRODUCT_VIDEOS,
  PRODUCT_VIDEO_ACCEPT,
  PRODUCT_VIDEO_MAX_BYTES,
} from "../../lib/product-video";
import {
  CATEGORY_ICONS,
  categoryIcon,
  guessCategoryIcon,
} from "../../lib/category-icons";
import { ImageCropDialog } from "./ImageCropDialog";
import { cn, formatCurrency } from "../../lib/utils";
import { toast } from "sonner";
import {
  X,
  Package,
  Upload,
  Link as LinkIcon,
  Trash2,
  Plus,
  Star,
  Tag,
  ImageOff,
  Video,
} from "lucide-react";

const MAX_PRODUCT_PRICE = 999_999.99;

/**
 * Every panel stays **mounted** (hidden via `hidden`, never unmounted), because
 * `handleSubmit` reads state rather than the DOM and no field uses native
 * `required`. Switching tabs therefore cannot drop a draft typed in another one.
 */
const TABS = [
  { id: "basico", label: "Básico" },
  { id: "envio", label: "Categorias e envio" },
  { id: "midia", label: "Fotos e vídeos" },
  { id: "variacoes", label: "Variações" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface ProductModalProps {
  mode: "create" | "edit";
  product?: Product | null;
  categories: Category[];
  onClose: () => void;
  onSuccess: () => void;
  /** Called after a category is created/removed so the parent can refetch. */
  onCategoriesChange?: () => void;
  /** Immediate upload in edit mode — keep the list thumbnail in sync without remounting the modal. */
  onImagesChange?: (productId: string, images: string[]) => void;
}

interface FormState {
  name: string;
  description: string;
  price: string;
  compareAtPrice: string;
  costPrice: string;
  /** Primary category first; the rest are secondary. */
  categoryIds: string[];
  stock: string;
  sku: string;
  active: boolean;
  featured: boolean;
  weightG: string;
  heightCm: string;
  widthCm: string;
  lengthCm: string;
  wholesaleEnabled: boolean;
  wholesaleMinQty: string;
}

interface AxisDraft {
  name: string;
  optionsText: string;
}

function toFormState(product?: Product | null): FormState {
  return {
    name: product?.name ?? "",
    description: product?.description ?? "",
    price: product ? String(product.price) : "",
    compareAtPrice:
      product?.compareAtPrice != null ? String(product.compareAtPrice) : "",
    costPrice: product?.costPrice != null ? String(product.costPrice) : "",
    categoryIds: product?.categoryIds?.length
      ? product.categoryIds
      : product?.categoryId
        ? [product.categoryId]
        : [],
    stock: product?.stock != null ? String(product.stock) : "0",
    sku: product?.sku ?? "",
    active: product?.active ?? true,
    featured: product?.featured ?? false,
    weightG: product?.weightG != null ? String(product.weightG) : "",
    heightCm: product?.heightCm != null ? String(product.heightCm) : "",
    widthCm: product?.widthCm != null ? String(product.widthCm) : "",
    lengthCm: product?.lengthCm != null ? String(product.lengthCm) : "",
    wholesaleEnabled: product?.wholesaleEnabled ?? false,
    wholesaleMinQty:
      product?.wholesaleMinQty != null ? String(product.wholesaleMinQty) : "1",
  };
}

export function ProductModal({
  mode,
  product,
  categories,
  onClose,
  onSuccess,
  onCategoriesChange,
  onImagesChange,
}: ProductModalProps) {
  const isEditMode = mode === "edit";

  const [form, setForm] = useState<FormState>(() => toFormState(product));
  const [tab, setTab] = useState<TabId>("basico");
  const [loading, setLoading] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"prepare" | "upload">(
    "prepare",
  );

  function axesToDrafts(axes?: VariantAxis[] | null): AxisDraft[] {
    if (!axes?.length) return [{ name: "Cor", optionsText: "" }];
    return axes.map((a) => ({
      name: a.name,
      optionsText: a.options.join(", "),
    }));
  }
  function variantsToRows(variants?: Product["variants"]): VariantInput[] {
    return (variants ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      options: v.options,
      sku: v.sku,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      stock: v.stock,
      images: v.images,
      active: v.active,
      sortOrder: v.sortOrder,
    }));
  }

  const [hasVariants, setHasVariants] = useState(
    () => product?.hasVariants ?? false,
  );
  const [axisDrafts, setAxisDrafts] = useState<AxisDraft[]>(() =>
    axesToDrafts(product?.variantAxes),
  );
  const [variantRows, setVariantRows] = useState<VariantInput[]>(() =>
    variantsToRows(product?.variants),
  );
  const [newOptionByAxis, setNewOptionByAxis] = useState<
    Record<number, string>
  >({});

  /** Splits on comma, semicolon or newline, dropping case-insensitive dupes. */
  function parseOptionsText(text: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of text.split(/[,;\n]+/)) {
      const o = part.trim();
      if (!o) continue;
      const key = o.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(o);
    }
    return out;
  }

  /**
   * Folds in the option still sitting in the input. Without this, typing an
   * option and going straight to "generate" silently discards it.
   */
  function draftsWithPendingOptions(): AxisDraft[] {
    return axisDrafts.map((draft, idx) => {
      const pending = (newOptionByAxis[idx] ?? "").trim();
      if (!pending) return draft;
      const options = parseOptionsText(draft.optionsText);
      if (options.some((o) => o.toLowerCase() === pending.toLowerCase()))
        return draft;
      return { ...draft, optionsText: [...options, pending].join(", ") };
    });
  }

  function buildAxes(
    drafts: AxisDraft[] = draftsWithPendingOptions(),
  ): VariantAxis[] {
    const axes: VariantAxis[] = [];
    for (const draft of drafts) {
      const options = parseOptionsText(draft.optionsText);
      if (draft.name.trim() && options.length) {
        axes.push({ name: draft.name.trim(), options });
      }
    }
    return axes;
  }

  function addAxisDraft() {
    setAxisDrafts((prev) => [...prev, { name: "", optionsText: "" }]);
  }

  function removeAxisDraft(index: number) {
    setAxisDrafts((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
    );
  }

  function updateAxisDraft(index: number, patch: Partial<AxisDraft>) {
    setAxisDrafts((prev) =>
      prev.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    );
  }

  function addOptionChip(axisIndex: number) {
    const raw = (newOptionByAxis[axisIndex] ?? "").trim();
    if (!raw) return;
    const current = parseOptionsText(axisDrafts[axisIndex]?.optionsText ?? "");
    if (current.some((o) => o.toLowerCase() === raw.toLowerCase())) {
      toast.error("Opção já existe neste tipo");
      return;
    }
    updateAxisDraft(axisIndex, { optionsText: [...current, raw].join(", ") });
    setNewOptionByAxis((prev) => ({ ...prev, [axisIndex]: "" }));
  }

  function removeOptionChip(axisIndex: number, option: string) {
    const current = parseOptionsText(axisDrafts[axisIndex]?.optionsText ?? "");
    updateAxisDraft(axisIndex, {
      optionsText: current.filter((o) => o !== option).join(", "),
    });
  }

  /** Cartesian product of the axes: one combination per SKU. */
  function axisCombinations(axes: VariantAxis[]): Record<string, string>[] {
    let combos: Record<string, string>[] = [{}];
    for (const axis of axes) {
      const next: Record<string, string>[] = [];
      for (const combo of combos) {
        for (const opt of axis.options) next.push({ ...combo, [axis.name]: opt });
      }
      combos = next;
    }
    return combos;
  }

  function comboName(axes: VariantAxis[], options: Record<string, string>): string {
    return axes.map((a) => options[a.name]).join(" / ");
  }

  function newVariantRow(
    name: string,
    options: Record<string, string>,
    sortOrder: number,
  ): VariantInput {
    return {
      name,
      options,
      sku: "",
      price: Number(form.price) || 0,
      compareAtPrice: null,
      stock: Number(form.stock) || 0,
      images: [],
      active: true,
      sortOrder,
    };
  }

  /**
   * Adds missing SKUs without ever dropping a filled row: a row whose name no
   * longer matches the axes (legacy data, renamed option) stays for the admin
   * to decide on.
   */
  function mergeVariantMatrix(
    axes: VariantAxis[],
    rows: VariantInput[],
  ): { ok: true; rows: VariantInput[] } | { ok: false; error: string } {
    const combos = axisCombinations(axes);
    if (combos.length > 500) {
      return {
        ok: false,
        error: `Combinações demais (${combos.length}). Reduza opções ou tipos (máx. 500 SKUs).`,
      };
    }
    const byName = new Map(rows.map((r) => [r.name, r]));
    const merged = [...rows];
    for (const options of combos) {
      const name = comboName(axes, options);
      if (byName.has(name)) continue;
      merged.push(newVariantRow(name, options, merged.length));
    }
    return { ok: true, rows: merged.map((r, i) => ({ ...r, sortOrder: i })) };
  }

  function generateVariantMatrix() {
    // Commit whatever is still typed before generating.
    const drafts = draftsWithPendingOptions();
    setAxisDrafts(drafts);
    setNewOptionByAxis({});

    const axes = buildAxes(drafts);
    if (!axes.length) {
      const semNome = drafts.some((d) => !d.name.trim());
      toast.error(
        semNome
          ? "Dê um nome ao tipo (ex.: Cor) antes de gerar as combinações."
          : "Adicione ao menos uma opção (ex.: Rosa) no tipo antes de gerar as combinações.",
      );
      return;
    }
    const combos = axisCombinations(axes);
    if (combos.length > 500) {
      toast.error(
        `Combinações demais (${combos.length}). Reduza opções ou tipos (máx. 500 SKUs).`,
      );
      return;
    }
    // Explicit action: the matrix becomes exactly what the axes describe,
    // carrying over price/stock/photo from rows with the same name.
    const existingByName = new Map(variantRows.map((r) => [r.name, r]));
    const rows: VariantInput[] = combos.map((options, idx) => {
      const name = comboName(axes, options);
      const prev = existingByName.get(name);
      return prev
        ? { ...prev, options, sortOrder: idx }
        : newVariantRow(name, options, idx);
    });
    setVariantRows(rows);
    setHasVariants(true);
    toast.success(
      `${rows.length} variação(ões) gerada(s) — confira preço/estoque e salve`,
    );
  }

  // Image management. `images` holds URLs already saved / added by URL.
  // `pendingFiles` holds newly picked files that must be uploaded after the
  // product exists (upload requires a productId).
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [imageUrl, setImageUrl] = useState("");

  // Links apply immediately (saved by the PATCH); an MP4 needs a productId,
  // so on create the file is uploaded after the save.
  const [videos, setVideos] = useState<ProductVideo[]>(product?.videos ?? []);
  const [videoUrl, setVideoUrl] = useState("");
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [cropSession, setCropSession] = useState<
    | { files: File[]; kind: "listing" }
    | { files: File[]; kind: "variant"; variantIndex: number }
    | null
  >(null);

  // Per-variant photos, keyed by row index. No productId exists on create,
  // so these upload during the save.
  const [pendingVariantFiles, setPendingVariantFiles] = useState<
    Record<number, File[]>
  >({});
  const [pendingVariantPreviews, setPendingVariantPreviews] = useState<
    Record<number, string[]>
  >({});
  const [variantUrlDraft, setVariantUrlDraft] = useState<
    Record<number, string>
  >({});

  // Inline category creation
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);

  useEffect(() => {
    setForm(toFormState(product));
    setImages(product?.images ?? []);
    setPendingFiles([]);
    setVideos(product?.videos ?? []);
    setVideoUrl("");
    setPendingVideoFile(null);
    setHasVariants(product?.hasVariants ?? false);
    setAxisDrafts(axesToDrafts(product?.variantAxes));
    setVariantRows(variantsToRows(product?.variants));
    setNewOptionByAxis({});
    setPendingVariantFiles({});
    setPendingVariantPreviews((prev) => {
      for (const urls of Object.values(prev))
        for (const url of urls) URL.revokeObjectURL(url);
      return {};
    });
    setVariantUrlDraft({});
    // Reset only when switching products — a new `product` object with the same
    // id (parent list refresh) must not wipe photos just uploaded.
  }, [product?.id]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  function toggleCategory(id: string) {
    setForm((prev) => {
      if (prev.categoryIds.includes(id)) {
        return {
          ...prev,
          categoryIds: prev.categoryIds.filter((c) => c !== id),
        };
      }
      if (prev.categoryIds.length >= MAX_PRODUCT_CATEGORIES) {
        toast.error(
          `Máximo de ${MAX_PRODUCT_CATEGORIES} categorias por produto`,
        );
        return prev;
      }
      return { ...prev, categoryIds: [...prev.categoryIds, id] };
    });
  }

  /** Position 0 is the category used by the sitemap and by related products. */
  function makePrimaryCategory(id: string) {
    setForm((prev) => ({
      ...prev,
      categoryIds: [id, ...prev.categoryIds.filter((c) => c !== id)],
    }));
  }

  function handleAddImageUrl() {
    const url = imageUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast.error("Informe uma URL válida (http/https)");
      return;
    }
    setImages((prev) => [...prev, url]);
    setImageUrl("");
  }

  async function commitListingImages(picked: File[]) {
    const room = MAX_PRODUCT_IMAGES - (images.length + pendingFiles.length);
    if (room <= 0) {
      toast.error(
        `A galeria já tem ${MAX_PRODUCT_IMAGES} fotos. Remova alguma antes de enviar outra.`,
      );
      return;
    }
    if (picked.length > room) {
      toast.message(
        `Só cabem mais ${room} foto(s) na galeria — o excedente foi ignorado`,
      );
    }

    setUploadingImages(true);
    setUploadPhase("prepare");
    try {
      const { files, errors, compressedCount } = await prepareProductImages(
        picked.slice(0, room),
      );
      for (const msg of errors) toast.error(msg);
      if (files.length === 0) return;

      // Edit mode uploads immediately.
      if (isEditMode && product?.id) {
        setUploadPhase("upload");
        const result = await uploadProductImages(product.id, files);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setImages(result.product.images);
        onImagesChange?.(product.id, result.product.images);
        if (result.skippedOverLimit > 0) {
          toast.error(
            `${result.skippedOverLimit} foto(s) não couberam no limite da galeria`,
          );
        }
        toast.success(
          files.length === 1
            ? "Imagem enviada"
            : `${files.length} imagens enviadas${compressedCount ? " (compactadas)" : ""}`,
        );
        return;
      }

      // Create mode defers the upload to the save, which yields a productId.
      setPendingFiles((prev) => [...prev, ...files]);
      if (compressedCount > 0) {
        toast.message(
          compressedCount === 1
            ? "Foto redimensionada automaticamente"
            : `${compressedCount} fotos redimensionadas automaticamente`,
        );
      }
    } catch (error) {
      logger.error("Error preparing product images:", error);
      toast.error("Erro ao processar as imagens selecionadas");
    } finally {
      setUploadingImages(false);
    }
  }

  function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    // Allow re-picking the same file later.
    e.target.value = "";
    if (picked.length === 0) return;
    setCropSession({ files: picked, kind: "listing" });
  }

  function removeExistingImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function setVariantImages(idx: number, nextImages: string[]) {
    setVariantRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, images: nextImages } : r)),
    );
  }

  function variantImageCount(idx: number): number {
    return (
      (variantRows[idx]?.images?.length ?? 0) +
      (pendingVariantFiles[idx]?.length ?? 0)
    );
  }

  function appendVariantImages(idx: number, urls: string[]) {
    setVariantRows((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r;
        const merged = [...(r.images ?? [])];
        for (const url of urls) {
          if (merged.length >= MAX_VARIANT_IMAGES) break;
          if (!merged.includes(url)) merged.push(url);
        }
        return { ...r, images: merged };
      }),
    );
  }

  function removeVariantImage(idx: number, url: string) {
    setVariantImages(
      idx,
      (variantRows[idx]?.images ?? []).filter((u) => u !== url),
    );
  }

  function revokePendingPreviews(idx: number) {
    setPendingVariantPreviews((prev) => {
      for (const url of prev[idx] ?? []) URL.revokeObjectURL(url);
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  }

  function removePendingVariantFile(idx: number, fileIndex: number) {
    setPendingVariantFiles((prev) => {
      const rest = (prev[idx] ?? []).filter((_, i) => i !== fileIndex);
      const next = { ...prev };
      if (rest.length) next[idx] = rest;
      else delete next[idx];
      return next;
    });
    setPendingVariantPreviews((prev) => {
      const urls = prev[idx] ?? [];
      const removed = urls[fileIndex];
      if (removed) URL.revokeObjectURL(removed);
      const rest = urls.filter((_, i) => i !== fileIndex);
      const next = { ...prev };
      if (rest.length) next[idx] = rest;
      else delete next[idx];
      return next;
    });
  }

  function clearVariantImages(idx: number) {
    setVariantImages(idx, []);
    setPendingVariantFiles((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
    revokePendingPreviews(idx);
  }

  function assignGalleryImageToVariant(idx: number, url: string) {
    if (variantImageCount(idx) >= MAX_VARIANT_IMAGES) {
      toast.error(`Máximo de ${MAX_VARIANT_IMAGES} fotos por variação`);
      return;
    }
    appendVariantImages(idx, [url]);
  }

  async function commitVariantImages(raw: File[], idx: number) {
    const room = MAX_VARIANT_IMAGES - variantImageCount(idx);
    if (room <= 0) {
      toast.error(`Esta variação já tem ${MAX_VARIANT_IMAGES} fotos`);
      return;
    }
    if (raw.length > room) {
      toast.message(
        `Só cabem mais ${room} foto(s) nesta variação — o excedente foi ignorado`,
      );
    }

    const prepared = await prepareProductImages(raw.slice(0, room));
    for (const msg of prepared.errors) toast.error(msg);
    if (prepared.files.length === 0) return;

    // Goes through /media rather than /images: these belong to the SKU, not to
    // the listing gallery, which has its own cap.
    const productId = product?.id;
    if (productId) {
      try {
        const result = await uploadProductMedia(productId, prepared.files);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        appendVariantImages(idx, result.urls);
        toast.success(
          `${result.urls.length} foto(s) da variação "${variantRows[idx]?.name ?? ""}" — salve para confirmar`,
        );
      } catch (error) {
        logger.error("Error uploading variant images:", error);
        toast.error("Erro ao enviar fotos da variação");
      }
      return;
    }

    // Create mode previews locally and uploads during the save.
    setPendingVariantFiles((prev) => ({
      ...prev,
      [idx]: [...(prev[idx] ?? []), ...prepared.files],
    }));
    setPendingVariantPreviews((prev) => ({
      ...prev,
      [idx]: [
        ...(prev[idx] ?? []),
        ...prepared.files.map((f) => URL.createObjectURL(f)),
      ],
    }));
  }

  function handleVariantFilePick(
    e: React.ChangeEvent<HTMLInputElement>,
    idx: number,
  ) {
    const raw = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (raw.length === 0) return;
    setCropSession({ files: raw, kind: "variant", variantIndex: idx });
  }

  function handleCropComplete(cropped: File[]) {
    const session = cropSession;
    setCropSession(null);
    if (!session || cropped.length === 0) return;
    if (session.kind === "variant") {
      void commitVariantImages(cropped, session.variantIndex);
      return;
    }
    void commitListingImages(cropped);
  }

  function applyVariantImageUrl(idx: number) {
    const url = (variantUrlDraft[idx] ?? "").trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast.error("URL da variação inválida (use http/https)");
      return;
    }
    if (variantImageCount(idx) >= MAX_VARIANT_IMAGES) {
      toast.error(`Máximo de ${MAX_VARIANT_IMAGES} fotos por variação`);
      return;
    }
    appendVariantImages(idx, [url]);
    setVariantUrlDraft((prev) => ({ ...prev, [idx]: "" }));
  }

  function handleAddVideoUrl() {
    if (videos.length >= MAX_PRODUCT_VIDEOS) {
      toast.error(`Máximo de ${MAX_PRODUCT_VIDEOS} vídeos por produto`);
      return;
    }
    const parsed = parseVideoUrl(videoUrl);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    if (videos.some((v) => v.url === parsed.video.url)) {
      toast.error("Este vídeo já está no produto");
      return;
    }
    setVideos((prev) => [...prev, parsed.video]);
    setVideoUrl("");
  }

  function removeVideo(url: string) {
    setVideos((prev) => prev.filter((v) => v.url !== url));
  }

  // ─── Pending drafts ────────────────────────────────────────────────────────
  // A link typed but not yet confirmed with "+" still counts as chosen.
  // Without this the save silently dropped what the admin had just pasted.

  type Resolved<T> = { value: T; error?: string };

  function resolvePendingVideos(): Resolved<ProductVideo[]> {
    const raw = videoUrl.trim();
    if (!raw) return { value: videos };
    const parsed = parseVideoUrl(raw);
    if (!parsed.ok) return { value: videos, error: parsed.error };
    if (videos.some((v) => v.url === parsed.video.url)) return { value: videos };
    if (videos.length + (pendingVideoFile ? 1 : 0) >= MAX_PRODUCT_VIDEOS) {
      return {
        value: videos,
        error: `Máximo de ${MAX_PRODUCT_VIDEOS} vídeos por produto — remova um antes de adicionar o link.`,
      };
    }
    return { value: [...videos, parsed.video] };
  }

  function resolvePendingImages(): Resolved<string[]> {
    const raw = imageUrl.trim();
    if (!raw) return { value: images };
    if (!/^https?:\/\//i.test(raw)) {
      return { value: images, error: "URL da imagem inválida (use http/https)" };
    }
    if (images.includes(raw)) return { value: images };
    if (images.length + pendingFiles.length >= MAX_PRODUCT_IMAGES) {
      return {
        value: images,
        error: `A galeria já tem ${MAX_PRODUCT_IMAGES} fotos — remova alguma antes de adicionar a URL.`,
      };
    }
    return { value: [...images, raw] };
  }

  function resolvePendingVariantImages(
    row: VariantInput,
    idx: number,
  ): Resolved<string[]> {
    const current = row.images ?? [];
    const raw = (variantUrlDraft[idx] ?? "").trim();
    if (!raw) return { value: current };
    if (!/^https?:\/\//i.test(raw)) {
      return {
        value: current,
        error: `URL da foto da variação "${row.name}" inválida (use http/https)`,
      };
    }
    if (current.includes(raw)) return { value: current };
    if (current.length >= MAX_VARIANT_IMAGES) {
      return {
        value: current,
        error: `A variação "${row.name}" já tem ${MAX_VARIANT_IMAGES} fotos.`,
      };
    }
    return { value: [...current, raw] };
  }

  async function handlePickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (videos.length + (pendingVideoFile ? 1 : 0) >= MAX_PRODUCT_VIDEOS) {
      toast.error(`Máximo de ${MAX_PRODUCT_VIDEOS} vídeos por produto`);
      return;
    }
    if (file.size > PRODUCT_VIDEO_MAX_BYTES) {
      toast.error(
        `Vídeo muito grande (máximo ${Math.round(PRODUCT_VIDEO_MAX_BYTES / 1024 / 1024)} MB). Suba no YouTube e cole o link.`,
      );
      return;
    }

    // Create mode uploads during the save, once a productId exists.
    if (!product?.id) {
      setPendingVideoFile(file);
      toast.message("Vídeo será enviado ao salvar o produto");
      return;
    }

    setUploadingVideo(true);
    try {
      const result = await uploadProductVideo(product.id, file);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setVideos(result.product.videos ?? []);
      toast.success("Vídeo enviado");
    } catch (error) {
      logger.error("Error uploading video:", error);
      toast.error("Erro ao enviar o vídeo");
    }
    setUploadingVideo(false);
  }

  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    setCreatingCategory(true);
    try {
      const created = await createCategory({ name, active: true });
      if (created) {
        toast.success("Categoria criada");
        setNewCategoryName("");
        toggleCategory(created.id);
        onCategoriesChange?.();
      } else {
        toast.error("Erro ao criar categoria");
      }
    } catch (error) {
      logger.error("Error creating category:", error);
      toast.error("Erro ao criar categoria");
    }
    setCreatingCategory(false);
  }

  async function handleSetCategoryIcon(id: string, icon: string) {
    try {
      const updated = await updateCategory(id, { icon: icon || null });
      if (!updated) {
        toast.error("Erro ao salvar o ícone");
        return;
      }
      onCategoriesChange?.();
    } catch (error) {
      logger.error("Error setting category icon:", error);
      toast.error("Erro ao salvar o ícone");
    }
  }

  async function handleDeleteCategory(id: string, name: string) {
    if (
      !window.confirm(
        `Remover a categoria "${name}"? Os produtos vinculados ficarão sem categoria.`,
      )
    )
      return;
    try {
      const ok = await deleteCategory(id);
      if (ok) {
        toast.success("Categoria removida");
        update(
          "categoryIds",
          form.categoryIds.filter((c) => c !== id),
        );
        onCategoriesChange?.();
      } else {
        toast.error("Erro ao remover categoria");
      }
    } catch (error) {
      logger.error("Error deleting category:", error);
      toast.error("Erro ao remover categoria");
    }
  }

  /**
   * Rejects the save and switches to the tab holding the offending field.
   *
   * With a tabbed form a bare toast is a dead end: "invalid price on variant X"
   * helps nobody who is looking at the Basics tab.
   */
  function fail(where: TabId, message: string): void {
    setTab(where);
    toast.error(message);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const name = form.name.trim();
    if (name.length < 2) {
      return fail("basico", "Informe o nome do produto");
    }
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0 || price > MAX_PRODUCT_PRICE) {
      return fail(
        "basico",
        `Preço inválido (use 0 a ${MAX_PRODUCT_PRICE.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`,
      );
    }

    const compareAtPrice = form.compareAtPrice.trim()
      ? Number(form.compareAtPrice)
      : null;
    if (
      compareAtPrice != null &&
      (!Number.isFinite(compareAtPrice) ||
        compareAtPrice < 0 ||
        compareAtPrice > MAX_PRODUCT_PRICE)
    ) {
      return fail(
        "basico",
        `Preço "de" inválido (use 0 a ${MAX_PRODUCT_PRICE.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`,
      );
    }

    // Empty stays null, not zero: "I don't know the cost" and "the cost is
    // zero" are different things and the report treats each on its own terms.
    const costPrice = form.costPrice.trim() ? Number(form.costPrice) : null;
    if (
      costPrice != null &&
      (!Number.isFinite(costPrice) || costPrice < 0 || costPrice > MAX_PRODUCT_PRICE)
    ) {
      return fail(
        "basico",
        `Custo inválido (use 0 a ${MAX_PRODUCT_PRICE.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`,
      );
    }

    const stock = form.stock.trim() ? Number(form.stock) : 0;
    if (!Number.isInteger(stock) || stock < 0) {
      return fail("basico", "Estoque inválido");
    }

    const weightG = form.weightG.trim() ? Number(form.weightG) : null;
    const heightCm = form.heightCm.trim() ? Number(form.heightCm) : null;
    const widthCm = form.widthCm.trim() ? Number(form.widthCm) : null;
    const lengthCm = form.lengthCm.trim() ? Number(form.lengthCm) : null;
    if (weightG != null && (!Number.isInteger(weightG) || weightG <= 0)) {
      return fail("envio", "Peso (g) inválido");
    }

    const wholesaleMinQty = form.wholesaleMinQty.trim()
      ? Math.max(1, Number(form.wholesaleMinQty))
      : 1;
    if (!Number.isInteger(wholesaleMinQty) || wholesaleMinQty < 1) {
      return fail("basico", "Qtd. mínima atacado inválida");
    }

    // Drafts still in the input are part of the save: typing then hitting Save
    // must behave like typing then hitting "+".
    const resolvedImages = resolvePendingImages();
    if (resolvedImages.error) {
      return fail("midia", resolvedImages.error);
    }
    const resolvedVideos = resolvePendingVideos();
    if (resolvedVideos.error) {
      return fail("midia", resolvedVideos.error);
    }

    // Axes filled without pressing "generate" must still become SKUs; the
    // product used to save with no variants at all and no warning.
    const drafts = draftsWithPendingOptions();
    const axes = hasVariants ? buildAxes(drafts) : [];
    let rows = variantRows;
    if (hasVariants) {
      if (!axes.length) {
        return fail(
          "variacoes",
          'Variações estão ativas mas sem tipo + opções. Preencha (ex.: Cor → Rosa, Preto) ou desmarque "Ativar".',
        );
      }
      const merged = mergeVariantMatrix(axes, rows);
      if (!merged.ok) {
        return fail("variacoes", merged.error);
      }
      // Removing an option from the axes does not delete the SKU here: it may
      // hold stock and photos. "Generate" is the explicit way to rebuild.
      const nomesDosEixos = new Set(
        axisCombinations(axes).map((o) => comboName(axes, o)),
      );
      const semEixo = merged.rows.filter((r) => !nomesDosEixos.has(r.name));
      if (semEixo.length) {
        toast.message(
          `${semEixo.length} variação(ões) fora dos tipos atuais foram mantidas (${semEixo
            .map((r) => r.name)
            .slice(0, 3)
            .join(", ")}). Use "Gerar combinações" para refazer a matriz.`,
        );
      }
      rows = merged.rows;
      // Mirror on screen exactly what will be written, even if the save fails.
      setAxisDrafts(drafts);
      setNewOptionByAxis({});
      setVariantRows(rows);
    }

    const badVariant = rows.find((r) => {
      const p = Number(r.price);
      return !Number.isFinite(p) || p < 0 || p > MAX_PRODUCT_PRICE;
    });
    if (hasVariants && badVariant) {
      return fail(
        "variacoes",
        `Preço inválido na variação "${badVariant.name}" (use 0 a ${MAX_PRODUCT_PRICE.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`,
      );
    }

    const variantImages: string[][] = [];
    for (const [idx, row] of rows.entries()) {
      const resolved = resolvePendingVariantImages(row, idx);
      if (resolved.error) {
        return fail("variacoes", resolved.error);
      }
      variantImages.push(resolved.value);
    }

    const payload: ProductInput = {
      name,
      description: form.description.trim() || null,
      price,
      compareAtPrice,
      costPrice,
      categoryIds: form.categoryIds,
      images: resolvedImages.value,
      videos: resolvedVideos.value,
      stock,
      sku: form.sku.trim() || null,
      active: form.active,
      featured: form.featured,
      weightG,
      heightCm,
      widthCm,
      lengthCm,
      wholesaleEnabled: form.wholesaleEnabled,
      wholesaleMinQty,
    };

    setLoading(true);
    try {
      let saved: Product | null;

      if (isEditMode && product) {
        saved = await updateProduct(product.id, payload);
      } else {
        saved = await createProduct(payload);
      }

      if (!saved) {
        toast.error(
          isEditMode ? "Erro ao atualizar produto" : "Erro ao criar produto",
        );
        setLoading(false);
        return;
      }

      // Needs a productId, so it runs after the product row exists.
      if (pendingFiles.length > 0) {
        const withImages = await uploadProductImages(saved.id, pendingFiles);
        if (!withImages.ok) {
          toast.error(
            `Produto salvo, mas falhou o upload das imagens: ${withImages.error}`,
          );
        } else {
          saved = withImages.product;
        }
      }

      // An MP4 picked before the product existed uploads now.
      if (pendingVideoFile) {
        const uploaded = await uploadProductVideo(saved.id, pendingVideoFile);
        if (!uploaded.ok) {
          toast.error(
            `Produto salvo, mas falhou o envio do vídeo: ${uploaded.error}`,
          );
        } else {
          saved = uploaded.product;
        }
      }

      // Variant photos still held as File objects (create mode).
      const rowsWithImages = rows.map((r, i) => ({
        ...r,
        price: Number(r.price),
        stock: Number(r.stock) || 0,
        images: [...(variantImages[i] ?? [])],
        sortOrder: i,
      }));
      for (const [idxStr, files] of Object.entries(pendingVariantFiles)) {
        const idx = Number(idxStr);
        const row = rowsWithImages[idx];
        if (!row || files.length === 0) continue;
        const uploaded = await uploadProductMedia(saved.id, files);
        if (!uploaded.ok) {
          toast.error(
            `Falha nas fotos da variação "${row.name}": ${uploaded.error}`,
          );
          continue;
        }
        row.images = [...row.images, ...uploaded.urls].slice(
          0,
          MAX_VARIANT_IMAGES,
        );
      }

      // Axes and prices were validated before the first write.
      if (hasVariants && rowsWithImages.length > 0) {
        const withVariants = await replaceProductVariants(
          saved.id,
          axes,
          rowsWithImages,
        );
        if (!withVariants) {
          toast.error(
            "Produto salvo, mas falhou ao gravar as variações. Tente de novo.",
          );
          setLoading(false);
          onSuccess();
          return;
        }
        saved = withVariants;
      } else if (isEditMode && product?.hasVariants && !hasVariants) {
        await replaceProductVariants(saved.id, [], []);
      }

      toast.success(isEditMode ? "Produto atualizado!" : "Produto criado!");
      onSuccess();
    } catch (error) {
      logger.error("Error saving product:", error);
      toast.error("Erro ao salvar produto");
    }
    setLoading(false);
  }

  /**
   * Counts confirmed content **and** drafts still in the inputs, because
   * drafts are part of the save; hiding them would misreport the form.
   */
  const tabCounts: Record<TabId, number> = {
    basico: 0,
    envio: form.categoryIds.length,
    midia:
      images.length +
      pendingFiles.length +
      (imageUrl.trim() ? 1 : 0) +
      videos.length +
      (videoUrl.trim() ? 1 : 0) +
      (pendingVideoFile ? 1 : 0),
    variacoes: hasVariants ? variantRows.length : 0,
  };

  const priceNum = Number(form.price);
  const compareNum = Number(form.compareAtPrice);
  const costNum = Number(form.costPrice);
  const showMarginHint =
    form.costPrice.trim() !== "" &&
    Number.isFinite(costNum) &&
    Number.isFinite(priceNum) &&
    priceNum > 0 &&
    costNum >= 0;
  const marginValue = priceNum - costNum;
  const marginPct = priceNum > 0 ? (marginValue / priceNum) * 100 : 0;
  const showDiscountHint =
    Number.isFinite(priceNum) &&
    Number.isFinite(compareNum) &&
    compareNum > priceNum &&
    priceNum > 0;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <Card
          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <CardHeader className="relative">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              {isEditMode ? "Editar Produto" : "Novo Produto"}
            </CardTitle>
            <CardDescription>
              {isEditMode
                ? "Atualize as informações do produto"
                : "Preencha os dados para cadastrar um novo produto na loja"}
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              {/*
                Section index. The count beside the label is what stops a tab
                from hiding work: opening a product shows "Fotos e vídeos 4"
                without having to enter to discover content is there.
              */}
              {/*
                Sticky at the top: anyone scrolling the Variações tab (the
                longest) must not have to go back to the start just to switch
                sections. The scrolling container is the Card itself, so
                `top-0` sticks to its top.
              */}
              <div
                role="tablist"
                aria-label="Seções do produto"
                className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto border-b border-border bg-card pb-px"
              >
                {TABS.map((t) => {
                  const count = tabCounts[t.id];
                  const isActive = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setTab(t.id)}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t.label}
                      {count > 0 && (
                        <Badge
                          variant={isActive ? "default" : "secondary"}
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {count}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className={cn("space-y-6", tab !== "basico" && "hidden")}>
                <div className="space-y-2">
                  <Label htmlFor="product-name">Nome do Produto</Label>
                  <Input
                    id="product-name"
                    placeholder="Ex.: Action Figure Goku Super Saiyajin"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="product-description">Descrição</Label>
                  <textarea
                    id="product-description"
                    rows={3}
                    placeholder="Detalhes, dimensões, material..."
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="product-price">Preço (R$)</Label>
                    <Input
                      id="product-price"
                      type="number"
                      step="0.01"
                      min="0"
                      max={MAX_PRODUCT_PRICE}
                      inputMode="decimal"
                      placeholder="Ex.: 7500 ou 149.90"
                      value={form.price}
                      onChange={(e) => update("price", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="product-compare">Preço "de" (opcional)</Label>
                    <Input
                      id="product-compare"
                      type="number"
                      step="0.01"
                      min="0"
                      max={MAX_PRODUCT_PRICE}
                      inputMode="decimal"
                      placeholder="Preço original riscado"
                      value={form.compareAtPrice}
                      onChange={(e) => update("compareAtPrice", e.target.value)}
                    />
                    {showDiscountHint && (
                      <p className="text-xs text-green-600">
                        Desconto de{" "}
                        {Math.round((1 - priceNum / compareNum) * 100)}% ·{" "}
                        <span className="line-through text-muted-foreground">
                          {formatCurrency(compareNum)}
                        </span>{" "}
                        → {formatCurrency(priceNum)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Cost — what separates revenue from profit in the report */}
                <div className="space-y-2">
                  <Label htmlFor="product-cost">Custo (opcional)</Label>
                  <Input
                    id="product-cost"
                    type="number"
                    step="0.01"
                    min="0"
                    max={MAX_PRODUCT_PRICE}
                    inputMode="decimal"
                    placeholder="Quanto você pagou por unidade"
                    value={form.costPrice}
                    onChange={(e) => update("costPrice", e.target.value)}
                  />
                  {showMarginHint ? (
                    <p
                      className={
                        marginValue >= 0
                          ? "text-xs text-green-600"
                          : "text-xs text-destructive"
                      }
                    >
                      {marginValue >= 0 ? "Margem" : "Prejuízo"} de{" "}
                      {formatCurrency(Math.abs(marginValue))} por unidade ·{" "}
                      {marginPct.toFixed(1)}%
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Sem custo, o relatório mostra quanto entrou — não quanto
                      sobrou. Este produto fica de fora do cálculo de margem.
                    </p>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="product-stock">Estoque</Label>
                    <Input
                      id="product-stock"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      placeholder="0"
                      value={form.stock}
                      onChange={(e) => update("stock", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="product-sku">SKU (opcional)</Label>
                    <Input
                      id="product-sku"
                      placeholder="Código interno"
                      value={form.sku}
                      onChange={(e) => update("sku", e.target.value)}
                    />
                  </div>
                </div>

                {/* Flags */}
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:border-primary/50">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => update("active", e.target.checked)}
                      className="h-4 w-4"
                    />
                    <div>
                      <p className="text-sm font-medium">Ativo</p>
                      <p className="text-xs text-muted-foreground">
                        Visível na loja
                      </p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:border-primary/50">
                    <input
                      type="checkbox"
                      checked={form.featured}
                      onChange={(e) => update("featured", e.target.checked)}
                      className="h-4 w-4"
                    />
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 text-yellow-500" /> Destaque
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Aparece em destaque
                      </p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:border-primary/50 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={form.wholesaleEnabled}
                      onChange={(e) =>
                        update("wholesaleEnabled", e.target.checked)
                      }
                      className="h-4 w-4"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Disponível no atacado</p>
                      <p className="text-xs text-muted-foreground">
                        Aparece em /atacado (desconto 25% para CNPJ aprovado).
                        Deixe desligado até a importação se ainda não for vender
                        no atacado.
                      </p>
                    </div>
                  </label>
                  {form.wholesaleEnabled && (
                    <div className="sm:col-span-2 space-y-1">
                      <Label htmlFor="wholesaleMinQty">
                        Qtd. mínima no atacado
                      </Label>
                      <Input
                        id="wholesaleMinQty"
                        type="number"
                        min={1}
                        value={form.wholesaleMinQty}
                        onChange={(e) =>
                          update("wholesaleMinQty", e.target.value)
                        }
                      />
                    </div>
                  )}
                </div>

              </div>

              <div className={cn("space-y-6", tab !== "envio" && "hidden")}>
                <div className="space-y-2">
                  <Label>Embalagem (frete Correios)</Label>
                  <p className="text-xs text-muted-foreground">
                    Usado no cálculo de frete. Se vazio, usa padrão 300g · 16×11×6
                    cm (photocard/caixa pequena).
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label
                        htmlFor="product-weight"
                        className="text-xs text-muted-foreground"
                      >
                        Peso (g)
                      </Label>
                      <Input
                        id="product-weight"
                        type="number"
                        min="1"
                        step="1"
                        placeholder="300"
                        value={form.weightG}
                        onChange={(e) => update("weightG", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor="product-len"
                        className="text-xs text-muted-foreground"
                      >
                        Comp. (cm)
                      </Label>
                      <Input
                        id="product-len"
                        type="number"
                        min="0.1"
                        step="0.1"
                        placeholder="16"
                        value={form.lengthCm}
                        onChange={(e) => update("lengthCm", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor="product-width"
                        className="text-xs text-muted-foreground"
                      >
                        Larg. (cm)
                      </Label>
                      <Input
                        id="product-width"
                        type="number"
                        min="0.1"
                        step="0.1"
                        placeholder="11"
                        value={form.widthCm}
                        onChange={(e) => update("widthCm", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor="product-height"
                        className="text-xs text-muted-foreground"
                      >
                        Alt. (cm)
                      </Label>
                      <Input
                        id="product-height"
                        type="number"
                        min="0.1"
                        step="0.1"
                        placeholder="6"
                        value={form.heightCm}
                        onChange={(e) => update("heightCm", e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Up to MAX_PRODUCT_CATEGORIES; first is primary */}
                <div className="space-y-2">
                  <Label>
                    Categorias{" "}
                    <span className="font-normal text-muted-foreground">
                      ({form.categoryIds.length}/{MAX_PRODUCT_CATEGORIES})
                    </span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Um mesmo produto pode aparecer em várias — ex.: chaveiro de
                    comidinha em <em>Comidas</em> e <em>Acessórios</em>. A marcada
                    como <strong className="text-foreground">principal</strong> é
                    a usada no link do produto e nas sugestões.
                  </p>

                  {categories.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                      Nenhuma categoria criada ainda — use o campo abaixo.
                    </p>
                  ) : (
                    <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
                      {categories.map((cat) => {
                        const checked = form.categoryIds.includes(cat.id);
                        const isPrimary = form.categoryIds[0] === cat.id;
                        return (
                          <div key={cat.id} className="flex items-center gap-2">
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50">
                              <input
                                type="checkbox"
                                className="h-4 w-4 shrink-0"
                                checked={checked}
                                onChange={() => toggleCategory(cat.id)}
                              />
                              <span className="truncate">{cat.name}</span>
                            </label>
                            {checked &&
                              (isPrimary ? (
                                <Badge
                                  variant="secondary"
                                  className="shrink-0 text-[10px]"
                                >
                                  principal
                                </Badge>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => makePrimaryCategory(cat.id)}
                                  className="shrink-0 text-[10px] text-muted-foreground underline hover:text-foreground"
                                  title="Tornar categoria principal"
                                >
                                  tornar principal
                                </button>
                              ))}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">
                        Gerenciar categorias
                      </span>
                    </div>
                    {categories.length > 0 && (
                      <div className="space-y-2">
                        {categories.map((cat) => {
                          const key =
                            cat.icon ?? guessCategoryIcon(cat.name) ?? "";
                          const Icon = categoryIcon(key);
                          return (
                            <div key={cat.id} className="flex items-center gap-2">
                              <Badge variant="secondary" className="gap-1 pr-1">
                                {Icon && <Icon className="h-3 w-3" aria-hidden />}
                                {cat.name}
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteCategory(cat.id, cat.name)
                                  }
                                  className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20"
                                  title="Remover categoria"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                              <select
                                value={key}
                                onChange={(e) =>
                                  handleSetCategoryIcon(cat.id, e.target.value)
                                }
                                aria-label={`Ícone da categoria ${cat.name}`}
                                className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                              >
                                <option value="">Sem ícone</option>
                                {CATEGORY_ICONS.map((opt) => (
                                  <option key={opt.key} value={opt.key}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nova categoria"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCreateCategory();
                          }
                        }}
                        className="h-9"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCreateCategory}
                        disabled={creatingCategory || !newCategoryName.trim()}
                      >
                        {creatingCategory ? (
                          <Loading size="sm" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

              </div>

              <div className={cn("space-y-6", tab !== "midia" && "hidden")}>
                <div className="space-y-3">
                  <Label>
                    Imagens{" "}
                    <span className="font-normal text-muted-foreground">
                      ({images.length + pendingFiles.length}/{MAX_PRODUCT_IMAGES})
                    </span>
                  </Label>

                  {/* Previews */}
                  {images.length > 0 || pendingFiles.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {images.map((url, i) => (
                        <div
                          key={`img-${i}`}
                          className="relative aspect-square rounded-lg overflow-hidden border border-border group"
                        >
                          <img
                            src={url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeExistingImage(i)}
                            className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remover imagem"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {pendingFiles.map((file, i) => (
                        <div
                          key={`file-${i}`}
                          className="relative aspect-square rounded-lg overflow-hidden border border-dashed border-primary/60 group"
                        >
                          <img
                            src={URL.createObjectURL(file)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute bottom-1 left-1 text-[10px] bg-primary/80 text-primary-foreground px-1 rounded">
                            novo
                          </span>
                          <button
                            type="button"
                            onClick={() => removePendingFile(i)}
                            className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remover imagem"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 border border-dashed border-border rounded-lg text-muted-foreground">
                      <ImageOff className="h-8 w-8 mb-2" />
                      <p className="text-xs">Nenhuma imagem adicionada</p>
                    </div>
                  )}

                  {/* File upload — <label> + overlay input (iOS Safari blocks click() on a hidden input). */}
                  <div>
                    <label
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "relative cursor-pointer overflow-hidden",
                        (uploadingImages || loading) &&
                          "pointer-events-none opacity-50",
                      )}
                    >
                      <input
                        type="file"
                        accept={PRODUCT_IMAGE_ACCEPT}
                        multiple
                        onChange={handlePickFiles}
                        disabled={uploadingImages || loading}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label="Enviar imagens"
                      />
                      {uploadingImages ? (
                        <Loading size="sm" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {uploadingImages
                        ? uploadPhase === "prepare"
                          ? "Preparando…"
                          : "Enviando…"
                        : "Enviar imagens"}
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {PRODUCT_IMAGE_ACCEPT_LABEL}
                      {isEditMode
                        ? " · envio imediato ao selecionar"
                        : pendingFiles.length > 0
                          ? " · serão enviadas ao salvar o produto"
                          : " · no produto novo, sobem ao salvar"}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Colar URL de imagem externa"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddImageUrl();
                          }
                        }}
                        className="pl-10"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddImageUrl}
                      aria-label="Adicionar imagem por URL"
                    >
                      Adicionar
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>
                    Vídeos{" "}
                    <span className="font-normal text-muted-foreground">
                      ({videos.length + (pendingVideoFile ? 1 : 0)}/
                      {MAX_PRODUCT_VIDEOS})
                    </span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Cole o link do YouTube/Instagram ou envie um MP4 (até{" "}
                    {Math.round(PRODUCT_VIDEO_MAX_BYTES / 1024 / 1024)} MB). O
                    vídeo aparece na galeria do produto na loja.
                  </p>

                  {(videos.length > 0 || pendingVideoFile) && (
                    <ul className="space-y-2">
                      {videos.map((video) => {
                        const thumb = videoThumbnail(video);
                        return (
                          <li
                            key={video.url}
                            className="flex items-center gap-3 rounded-md border border-border p-2"
                          >
                            <div className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Video className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <Badge variant="secondary" className="text-[10px]">
                                {videoKindLabel(video.kind)}
                              </Badge>
                              <p className="truncate text-xs text-muted-foreground">
                                {video.url}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeVideo(video.url)}
                              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title="Remover vídeo"
                              aria-label={`Remover vídeo ${video.url}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        );
                      })}
                      {pendingVideoFile && (
                        <li className="flex items-center gap-3 rounded-md border border-dashed border-primary/60 p-2">
                          <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-muted">
                            <Video className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <Badge variant="secondary" className="text-[10px]">
                              novo
                            </Badge>
                            <p className="truncate text-xs text-muted-foreground">
                              {pendingVideoFile.name} · sobe ao salvar
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPendingVideoFile(null)}
                            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Remover vídeo"
                            aria-label="Remover vídeo pendente"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      )}
                    </ul>
                  )}

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Colar link do YouTube ou Instagram"
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddVideoUrl();
                          }
                        }}
                        className="pl-10"
                        aria-label="Link do vídeo"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddVideoUrl}
                      aria-label="Adicionar vídeo por link"
                    >
                      Adicionar
                    </Button>
                  </div>

                  <label
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "relative cursor-pointer overflow-hidden",
                      (uploadingVideo ||
                        loading ||
                        videos.length >= MAX_PRODUCT_VIDEOS) &&
                        "pointer-events-none opacity-50",
                    )}
                  >
                    <input
                      type="file"
                      accept={PRODUCT_VIDEO_ACCEPT}
                      onChange={handlePickVideo}
                      disabled={uploadingVideo || loading}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label="Enviar vídeo MP4"
                    />
                    {uploadingVideo ? (
                      <Loading size="sm" />
                    ) : (
                      <Video className="h-4 w-4" />
                    )}
                    {uploadingVideo ? "Enviando vídeo…" : "Enviar MP4"}
                  </label>
                </div>

              </div>

              <div className={cn("space-y-6", tab !== "variacoes" && "hidden")}>
                {/* One axis + N options = N SKUs (uncapped) */}
                <div className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        Variações (foto por opção, estilo Shopee)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong className="text-foreground">Tipo</strong> = o que
                        muda (ex. Cor).{" "}
                        <strong className="text-foreground">Opções</strong> = cada
                        valor (Rosa, Preto, Azul…) —{" "}
                        <strong className="text-foreground">sem limite</strong>.
                        Clique em{" "}
                        <strong className="text-foreground">
                          Gerar combinações
                        </strong>{" "}
                        e cada linha ganha campo de{" "}
                        <strong className="text-foreground">foto própria</strong>,
                        preço e estoque.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={hasVariants}
                        onChange={(e) => setHasVariants(e.target.checked)}
                        aria-label="Ativar variações"
                      />
                      Ativar
                    </label>
                  </div>

                  {hasVariants && (
                    <div className="space-y-3">
                      <div className="space-y-3">
                        {axisDrafts.map((draft, idx) => {
                          const options = parseOptionsText(draft.optionsText);
                          return (
                            <div
                              key={idx}
                              className="space-y-2 rounded-md border border-border/60 p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <Label>
                                  Tipo {idx + 1}
                                  {idx === 0
                                    ? " (ex.: Cor)"
                                    : idx === 1
                                      ? " (ex.: Tamanho)"
                                      : ""}
                                </Label>
                                {axisDrafts.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-muted-foreground"
                                    onClick={() => removeAxisDraft(idx)}
                                    aria-label={`Remover tipo ${idx + 1}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                              <Input
                                value={draft.name}
                                onChange={(e) =>
                                  updateAxisDraft(idx, { name: e.target.value })
                                }
                                placeholder={
                                  idx === 0
                                    ? "Cor"
                                    : idx === 1
                                      ? "Tamanho"
                                      : "Nome do tipo"
                                }
                              />
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">
                                  Opções ({options.length}) — digite e adicione
                                  uma a uma
                                </Label>
                                <div className="flex flex-wrap gap-1.5">
                                  {options.map((opt) => (
                                    <span
                                      key={opt}
                                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                                    >
                                      {opt}
                                      <button
                                        type="button"
                                        className="rounded-full p-0.5 hover:bg-primary/20"
                                        onClick={() => removeOptionChip(idx, opt)}
                                        aria-label={`Remover ${opt}`}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  <Input
                                    className="h-8"
                                    placeholder="Ex.: Rosa"
                                    value={newOptionByAxis[idx] ?? ""}
                                    onChange={(e) =>
                                      setNewOptionByAxis((prev) => ({
                                        ...prev,
                                        [idx]: e.target.value,
                                      }))
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        addOptionChip(idx);
                                      }
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 shrink-0"
                                    onClick={() => addOptionChip(idx)}
                                  >
                                    <Plus className="h-4 w-4" />
                                    Opção
                                  </Button>
                                </div>
                                <Input
                                  className="h-8 text-xs"
                                  placeholder="Ou cole várias: Rosa, Preto, Azul"
                                  value={draft.optionsText}
                                  onChange={(e) =>
                                    updateAxisDraft(idx, {
                                      optionsText: e.target.value,
                                    })
                                  }
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addAxisDraft}
                        >
                          <Plus className="h-4 w-4" />
                          Outro tipo (ex. Tamanho)
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={generateVariantMatrix}
                        >
                          <Plus className="h-4 w-4" />
                          Gerar combinações
                        </Button>
                      </div>

                      {variantRows.length > 0 && (
                        <div className="max-h-96 space-y-3 overflow-y-auto rounded border p-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            {variantRows.length} SKU(s) — cada um com fotos
                            próprias (até {MAX_VARIANT_IMAGES}), preço, estoque e
                            SKU, como na Shopee
                          </p>
                          {variantRows.map((row, idx) => {
                            const savedImages = row.images ?? [];
                            const previews = pendingVariantPreviews[idx] ?? [];
                            const photoCount =
                              savedImages.length + previews.length;
                            const thumbUrl =
                              savedImages[0] || previews[0] || null;
                            return (
                              <div
                                key={row.name + idx}
                                className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-2"
                              >
                                {/*
                                On mobile the row stacks: 12 columns there gave
                                33px per cell and the 48px thumbnail overflowed.
                                `sm:contents` dissolves the wrappers on desktop,
                                putting the fields back on the 12-column grid.
                              */}
                                <div className="flex flex-col gap-2 text-sm sm:grid sm:grid-cols-12 sm:items-center">
                                  <div className="flex items-center gap-2 sm:contents">
                                    <div className="shrink-0 sm:col-span-2">
                                      <label
                                        className="relative flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-primary/40 bg-background hover:border-primary"
                                        title={`Foto de ${row.name}`}
                                        aria-label={`Enviar foto da variação ${row.name}`}
                                      >
                                        <input
                                          id={`variant-photo-${idx}`}
                                          type="file"
                                          accept={PRODUCT_IMAGE_ACCEPT}
                                          multiple
                                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                          onChange={(e) =>
                                            void handleVariantFilePick(e, idx)
                                          }
                                        />
                                        {thumbUrl ? (
                                          <img
                                            src={thumbUrl}
                                            alt=""
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <Upload className="h-4 w-4 text-muted-foreground" />
                                        )}
                                        {photoCount > 1 && (
                                          <span className="absolute bottom-0 right-0 rounded-tl bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                                            {photoCount}
                                          </span>
                                        )}
                                      </label>
                                    </div>
                                    <span
                                      className="min-w-0 flex-1 truncate font-medium sm:col-span-3"
                                      title={row.name}
                                    >
                                      {row.name}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 sm:contents">
                                    <Input
                                      className="h-8 sm:col-span-3"
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      max={MAX_PRODUCT_PRICE}
                                      value={row.price}
                                      onChange={(e) => {
                                        const price = Number(e.target.value);
                                        setVariantRows((rows) =>
                                          rows.map((r, i) =>
                                            i === idx ? { ...r, price } : r,
                                          ),
                                        );
                                      }}
                                      aria-label={`Preço ${row.name}`}
                                    />
                                    <Input
                                      className="h-8 sm:col-span-2"
                                      type="number"
                                      value={row.stock ?? 0}
                                      onChange={(e) => {
                                        const stock = Number(e.target.value);
                                        setVariantRows((rows) =>
                                          rows.map((r, i) =>
                                            i === idx ? { ...r, stock } : r,
                                          ),
                                        );
                                      }}
                                      aria-label={`Estoque ${row.name}`}
                                    />
                                    <Input
                                      className="col-span-2 h-8 sm:col-span-2"
                                      placeholder="SKU"
                                      value={row.sku ?? ""}
                                      onChange={(e) => {
                                        const sku = e.target.value;
                                        setVariantRows((rows) =>
                                          rows.map((r, i) =>
                                            i === idx ? { ...r, sku } : r,
                                          ),
                                        );
                                      }}
                                      aria-label={`SKU ${row.name}`}
                                    />
                                  </div>
                                </div>

                                {photoCount > 0 && (
                                  <div className="flex flex-wrap gap-1.5 pl-0 sm:pl-14">
                                    {savedImages.map((url) => (
                                      <div
                                        key={url}
                                        className="group relative h-12 w-12 overflow-hidden rounded border border-border"
                                      >
                                        <img
                                          src={url}
                                          alt=""
                                          className="h-full w-full object-cover"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            removeVariantImage(idx, url)
                                          }
                                          className="absolute right-0 top-0 rounded-bl bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                          title="Remover foto"
                                          aria-label={`Remover foto da variação ${row.name}`}
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ))}
                                    {previews.map((url, fileIndex) => (
                                      <div
                                        key={url}
                                        className="group relative h-12 w-12 overflow-hidden rounded border border-dashed border-primary/60"
                                      >
                                        <img
                                          src={url}
                                          alt=""
                                          className="h-full w-full object-cover"
                                        />
                                        <span className="absolute bottom-0 left-0 rounded-tr bg-primary/80 px-0.5 text-[9px] text-primary-foreground">
                                          novo
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            removePendingVariantFile(
                                              idx,
                                              fileIndex,
                                            )
                                          }
                                          className="absolute right-0 top-0 rounded-bl bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                          title="Remover foto"
                                          aria-label={`Remover foto pendente da variação ${row.name}`}
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-14">
                                  <label
                                    htmlFor={`variant-photo-${idx}`}
                                    className={cn(
                                      buttonVariants({
                                        variant: "outline",
                                        size: "sm",
                                      }),
                                      "h-7 cursor-pointer text-xs",
                                      photoCount >= MAX_VARIANT_IMAGES &&
                                        "pointer-events-none opacity-50",
                                    )}
                                  >
                                    <Upload className="h-3 w-3" />
                                    {photoCount > 0
                                      ? `Add fotos (${photoCount}/${MAX_VARIANT_IMAGES})`
                                      : "Fotos"}
                                  </label>
                                  {photoCount > 0 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs text-muted-foreground"
                                      onClick={() => clearVariantImages(idx)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                      Limpar
                                    </Button>
                                  )}
                                  <div className="flex min-w-0 flex-1 gap-1">
                                    <Input
                                      className="h-7 text-xs"
                                      placeholder="Ou cole URL da foto desta variação"
                                      value={variantUrlDraft[idx] ?? ""}
                                      onChange={(e) =>
                                        setVariantUrlDraft((prev) => ({
                                          ...prev,
                                          [idx]: e.target.value,
                                        }))
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          applyVariantImageUrl(idx);
                                        }
                                      }}
                                      aria-label={`URL da foto ${row.name}`}
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 shrink-0 text-xs"
                                      onClick={() => applyVariantImageUrl(idx)}
                                    >
                                      OK
                                    </Button>
                                  </div>
                                </div>

                                {/* Reuse an image already on the product */}
                                {images.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1.5 pl-0 sm:pl-14">
                                    <span className="text-[10px] text-muted-foreground">
                                      Da galeria:
                                    </span>
                                    {images.slice(0, 12).map((url) => (
                                      <button
                                        key={url}
                                        type="button"
                                        onClick={() =>
                                          assignGalleryImageToVariant(idx, url)
                                        }
                                        className={`h-8 w-8 overflow-hidden rounded border transition-colors ${
                                          savedImages.includes(url)
                                            ? "border-primary ring-1 ring-primary"
                                            : "border-border hover:border-primary/60"
                                        }`}
                                        title="Usar esta imagem na variação"
                                      >
                                        <img
                                          src={url}
                                          alt=""
                                          className="h-full w-full object-cover"
                                        />
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </CardContent>

            <CardFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? (
                  <Loading size="sm" />
                ) : isEditMode ? (
                  "Salvar Alterações"
                ) : (
                  "Criar Produto"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
      {cropSession && (
        <ImageCropDialog
          files={cropSession.files}
          onCancel={() => setCropSession(null)}
          onComplete={handleCropComplete}
        />
      )}
    </>
  );
}

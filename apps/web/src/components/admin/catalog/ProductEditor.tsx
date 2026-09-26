'use client';

import type { AdminBrandDto, AdminCategoryDto, AdminProductDto } from '@seshakart/types';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FormField,
  Input,
  Radio,
  Select,
  Textarea,
  cn,
  formatINR,
  useToast,
} from '@seshakart/ui';
import { GST_RATES, MAX_VARIANTS, productInputSchema, slugify } from '@seshakart/validation';
import { Archive, Copy, ExternalLink, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';
import { rupeesToPaise } from '@/lib/admin/money';
import { ConfirmDialog } from '../ConfirmDialog';
import {
  emptyState,
  emptyVariant,
  fromProduct,
  newKey,
  toPayload,
  type EditorState,
  type VariantDraft,
} from './editor-state';
import { ImageManager } from './ImageManager';
import { PRODUCT_STATUS } from './status';

type Confirm = null | 'delete' | 'archive' | 'unpublish';

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 sm:p-5"
    >
      <div>
        <h2 id={id} className="text-h4">
          {title}
        </h2>
        {description && <p className="mt-1 text-small text-text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Create/edit a product: details, images, variants (price, stock), tax, shipping and
 * SEO. Saved as a whole; publishing is a separate step so a draft can be prepared
 * safely. Validation uses the same schema as the API.
 */
export function ProductEditor({
  product,
  categories,
  brands,
  permissions,
}: {
  product: AdminProductDto | null;
  categories: AdminCategoryDto[];
  brands: AdminBrandDto[];
  permissions: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const initial = useMemo(() => (product ? fromProduct(product) : emptyState()), [product]);
  const [s, setS] = useState<EditorState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const canWrite = permissions.includes('products:write');
  const canDelete = permissions.includes('products:delete');
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);

  useEffect(() => setS(initial), [initial]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => {
    setS((prev) => ({ ...prev, [key]: value }));
    if (errors[key as string])
      setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));
  };
  const setVariant = (i: number, patch: Partial<VariantDraft>) =>
    setS((prev) => ({
      ...prev,
      variants: prev.variants.map((v, j) =>
        j === i ? { ...v, ...patch } : patch.isDefault ? { ...v, isDefault: false } : v,
      ),
    }));
  const text = (key: keyof EditorState) => ({
    name: key,
    value: s[key] as string,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as never),
    disabled: !canWrite,
  });

  const focusFirst = (errs: Record<string, string>) => {
    const first = Object.keys(errs)[0];
    if (!first) return;
    requestAnimationFrame(() => {
      const el =
        formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`) ??
        formRef.current?.querySelector<HTMLElement>(`[data-error-anchor="${first.split('.')[0]}"]`);
      el?.focus();
      el?.scrollIntoView({ block: 'center' });
    });
  };

  const save = async () => {
    setFormError(null);
    const { payload, errors: convErrors } = toPayload(s);
    const parsed = productInputSchema.safeParse(payload);
    const errs: Record<string, string> = { ...convErrors };
    if (!parsed.success)
      for (const issue of parsed.error.issues) errs[issue.path.join('.')] ??= issue.message;
    if (Object.keys(errs).length) {
      setErrors(errs);
      setFormError('Please fix the highlighted fields.');
      focusFirst(errs);
      return;
    }
    setSaving(true);
    try {
      const body = { ...payload, ...(product ? { expectedUpdatedAt: product.updatedAt } : {}) };
      const saved = product
        ? await api.put<AdminProductDto>(`/admin/products/${product.id}`, body)
        : await api.post<AdminProductDto>('/admin/products', body);
      setErrors({});
      toast({
        title: product ? 'Product saved' : 'Product created as a draft',
        variant: 'success',
      });
      if (product) router.refresh();
      else router.replace(`/admin/products/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const fe = err.fieldErrors();
        setErrors(fe);
        setFormError(err.message);
        focusFirst(fe);
      } else setFormError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED') => {
    if (!product) return;
    setStatusBusy(true);
    setFormError(null);
    try {
      await api.post(`/admin/products/${product.id}/status`, { status });
      toast({
        title:
          status === 'ACTIVE'
            ? 'Product is live'
            : status === 'ARCHIVED'
              ? 'Product archived'
              : 'Product moved to drafts',
        variant: 'success',
      });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        setFormError(
          err.details.length
            ? `${err.message} ${err.details.map((d) => d.message).join('. ')}.`
            : err.message,
        );
      } else setFormError('Something went wrong. Please try again.');
      throw err;
    } finally {
      setStatusBusy(false);
    }
  };

  const err = (path: string) => errors[path];
  const slugPreview = s.slug.trim() || slugify(s.name) || 'product-url';
  const metaTitle = s.metaTitle.trim() || s.name || 'Product name';
  const metaDescription =
    s.metaDescription.trim() || s.shortDescription || 'Product summary shown in search results.';
  const status = product ? PRODUCT_STATUS[product.status] : null;
  const priceSummary = s.variants
    .map((v) => rupeesToPaise(v.price))
    .filter((p): p is number => p !== null);

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/products"
          className="self-start text-small font-medium text-primary-dark"
        >
          ← All products
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-h2">{product ? product.name : 'Add product'}</h1>
            {status && <Badge variant={status.badge}>{status.label}</Badge>}
            {dirty && <span className="text-small text-warning-text">Unsaved changes</span>}
          </div>
          {canWrite && (
            <Button
              type="submit"
              loading={saving}
              loadingText="Saving…"
              disabled={!dirty && Boolean(product)}
            >
              {product ? 'Save changes' : 'Create draft'}
            </Button>
          )}
        </div>
      </div>

      {formError && (
        <Alert variant="error" title="Not saved">
          {formError}
        </Alert>
      )}
      {!canWrite && <Alert variant="info">You can view this product but not change it.</Alert>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-5">
          <Section id="sec-basics" title="Details">
            <FormField label="Product name" required error={err('name')}>
              <Input {...text('name')} maxLength={200} />
            </FormField>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
              <FormField
                label="SKU (product code)"
                required
                hint="Letters, numbers and - _ . /; stored in capitals"
                error={err('sku')}
              >
                <Input
                  {...text('sku')}
                  maxLength={64}
                  autoCapitalize="characters"
                  spellCheck={false}
                />
              </FormField>
              <FormField
                label="URL"
                hint={`seshakart.com/product/${slugPreview}`}
                error={err('slug')}
              >
                <Input
                  {...text('slug')}
                  placeholder={slugify(s.name) || 'generated from the name'}
                  maxLength={160}
                  spellCheck={false}
                />
              </FormField>
            </div>
            {product?.status === 'ACTIVE' && s.slug !== product.slug && (
              <Alert variant="warning">
                Changing the URL of a live product breaks existing links and search results until
                they update.
              </Alert>
            )}
            <FormField
              label="Short description"
              hint={`Shown near the price and in search results. ${s.shortDescription.length}/300`}
              error={err('shortDescription')}
            >
              <Textarea {...text('shortDescription')} rows={2} maxLength={300} />
            </FormField>
            <FormField
              label="Full description"
              hint="Plain text. Leave a blank line between paragraphs."
              error={err('description')}
            >
              <Textarea {...text('description')} rows={8} maxLength={10000} />
            </FormField>
            <FormField
              label="Key features"
              hint="One per line, up to 10. Shown as bullet points."
              error={
                err('highlights') ??
                Object.entries(errors).find(([k]) => k.startsWith('highlights.'))?.[1]
              }
            >
              <Textarea {...text('highlights')} rows={4} />
            </FormField>
          </Section>

          <Section
            id="sec-images"
            title="Images"
            description="The first image is the main one on listings and the product page."
          >
            <div data-error-anchor="images" tabIndex={-1} className="outline-none">
              <ImageManager
                images={s.images}
                variants={s.variants}
                errors={errors}
                onChange={(images) => set('images', images)}
              />
            </div>
          </Section>

          <Section
            id="sec-variants"
            title="Variants, prices and stock"
            description="Every product has at least one variant: each has its own SKU, price and stock. Prices include GST."
          >
            <div
              data-error-anchor="variants"
              tabIndex={-1}
              className="flex flex-col gap-3 outline-none"
            >
              {err('variants') && <Alert variant="error">{err('variants')}</Alert>}
              {s.variants.map((v, i) => (
                <VariantCard
                  key={v.key}
                  index={i}
                  v={v}
                  count={s.variants.length}
                  err={(f) => err(`variants.${i}.${f}`)}
                  disabled={!canWrite}
                  onChange={(patch) => setVariant(i, patch)}
                  onRemove={() =>
                    setS((prev) => {
                      const variants = prev.variants.filter((_, j) => j !== i);
                      if (v.isDefault && variants[0])
                        variants[0] = { ...variants[0], isDefault: true };
                      return { ...prev, variants };
                    })
                  }
                  productId={product?.id}
                />
              ))}
              {canWrite && s.variants.length < MAX_VARIANTS && (
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={() =>
                    setS((prev) => ({ ...prev, variants: [...prev.variants, emptyVariant()] }))
                  }
                >
                  <Plus size={16} aria-hidden="true" /> Add variant
                </Button>
              )}
            </div>
          </Section>

          <Section
            id="sec-specs"
            title="Specifications"
            description="Shown as a table on the product page."
          >
            <div className="flex flex-col gap-2">
              {s.specifications.map((sp, i) => (
                <div
                  key={sp.key}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-end gap-2"
                >
                  <FormField
                    label="Name"
                    hideLabel={i > 0}
                    error={err(`specifications.${i}.label`)}
                  >
                    <Input
                      size="sm"
                      name={`specifications.${i}.label`}
                      value={sp.label}
                      maxLength={60}
                      disabled={!canWrite}
                      placeholder="e.g. Battery"
                      onChange={(e) =>
                        set(
                          'specifications',
                          s.specifications.map((x, j) =>
                            j === i ? { ...x, label: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </FormField>
                  <FormField
                    label="Value"
                    hideLabel={i > 0}
                    error={err(`specifications.${i}.value`)}
                  >
                    <Input
                      size="sm"
                      name={`specifications.${i}.value`}
                      value={sp.value}
                      maxLength={300}
                      disabled={!canWrite}
                      placeholder="e.g. 40 hours"
                      onChange={(e) =>
                        set(
                          'specifications',
                          s.specifications.map((x, j) =>
                            j === i ? { ...x, value: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </FormField>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={!canWrite}
                    aria-label={`Remove specification ${sp.label || i + 1}`}
                    onClick={() =>
                      set(
                        'specifications',
                        s.specifications.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                </div>
              ))}
              {canWrite && s.specifications.length < 40 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    set('specifications', [
                      ...s.specifications,
                      { key: newKey('s'), label: '', value: '' },
                    ])
                  }
                >
                  <Plus size={16} aria-hidden="true" /> Add specification
                </Button>
              )}
            </div>
          </Section>

          <Section id="sec-shipping" title="Shipping, returns and warranty">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <FormField label="Weight (g)" error={err('weightGrams')}>
                <Input {...text('weightGrams')} inputMode="numeric" />
              </FormField>
              <FormField label="Length (mm)" error={err('lengthMm')}>
                <Input {...text('lengthMm')} inputMode="numeric" />
              </FormField>
              <FormField label="Width (mm)" error={err('widthMm')}>
                <Input {...text('widthMm')} inputMode="numeric" />
              </FormField>
              <FormField label="Height (mm)" error={err('heightMm')}>
                <Input {...text('heightMm')} inputMode="numeric" />
              </FormField>
            </div>
            <div className="flex flex-col gap-3">
              <Checkbox
                label="Cash on delivery available"
                checked={s.isCodAvailable}
                disabled={!canWrite}
                onChange={(e) => set('isCodAvailable', e.target.checked)}
              />
              <Checkbox
                label="Returnable"
                checked={s.isReturnable}
                disabled={!canWrite}
                onChange={(e) => set('isReturnable', e.target.checked)}
              />
            </div>
            {s.isReturnable && (
              <FormField
                label="Return window (days after delivery)"
                error={err('returnWindowDays')}
                className="max-w-xs"
              >
                <Input {...text('returnWindowDays')} inputMode="numeric" />
              </FormField>
            )}
            <FormField
              label="Delivery note"
              hint="Optional. Overrides the standard delivery text."
              error={err('shippingInfo')}
            >
              <Textarea {...text('shippingInfo')} rows={2} maxLength={1000} />
            </FormField>
            <FormField label="Returns note" error={err('returnInfo')}>
              <Textarea {...text('returnInfo')} rows={2} maxLength={1000} />
            </FormField>
            <FormField label="Warranty" error={err('warrantyInfo')}>
              <Textarea {...text('warrantyInfo')} rows={2} maxLength={1000} />
            </FormField>
            <FormField
              label="Video link"
              hint="Optional https:// link, e.g. YouTube"
              error={err('videoUrl')}
            >
              <Input {...text('videoUrl')} type="url" inputMode="url" />
            </FormField>
          </Section>

          <Section
            id="sec-seo"
            title="Search engine listing"
            description="Leave blank to use the product name and short description."
          >
            <FormField
              label="Page title"
              hint={`${s.metaTitle.length}/70`}
              error={err('metaTitle')}
            >
              <Input {...text('metaTitle')} maxLength={70} placeholder={s.name} />
            </FormField>
            <FormField
              label="Meta description"
              hint={`${s.metaDescription.length}/160`}
              error={err('metaDescription')}
            >
              <Textarea
                {...text('metaDescription')}
                rows={2}
                maxLength={160}
                placeholder={s.shortDescription}
              />
            </FormField>
            <div
              className="rounded-md border border-border bg-background p-3"
              aria-label="Search result preview"
              role="group"
            >
              <p className="text-caption text-text-muted">Preview</p>
              <p className="truncate text-caption text-success-text">
                seshakart.com › product › {slugPreview}
              </p>
              <p className="line-clamp-1 text-body font-medium text-primary-dark">
                {metaTitle} | SeShaKart
              </p>
              <p className="line-clamp-2 text-small text-text-secondary">{metaDescription}</p>
            </div>
          </Section>
        </div>

        <aside className="flex flex-col gap-5">
          {product && (
            <Section id="sec-status" title="Visibility">
              <p className="text-small text-text-secondary">
                {product.status === 'ACTIVE'
                  ? 'Live on the store.'
                  : product.status === 'DRAFT'
                    ? 'Draft: only staff can see it.'
                    : 'Archived: hidden from the store and search.'}
                {product.publishedAt &&
                  ` First published ${new Date(product.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}.`}
              </p>
              {dirty && canWrite && (
                <p className="text-caption text-warning-text">
                  Save your changes before changing visibility.
                </p>
              )}
              {canWrite && (
                <div className="flex flex-col gap-2">
                  {product.status !== 'ACTIVE' && (
                    <Button
                      loading={statusBusy}
                      disabled={dirty}
                      onClick={() => void changeStatus('ACTIVE').catch(() => undefined)}
                    >
                      <Eye size={16} aria-hidden="true" /> Publish
                    </Button>
                  )}
                  {product.status === 'ACTIVE' && (
                    <Button
                      variant="outline"
                      disabled={dirty}
                      onClick={() => setConfirm('unpublish')}
                    >
                      <EyeOff size={16} aria-hidden="true" /> Unpublish (move to drafts)
                    </Button>
                  )}
                  {product.status !== 'ARCHIVED' && (
                    <Button
                      variant="outline"
                      disabled={dirty}
                      onClick={() => setConfirm('archive')}
                    >
                      <Archive size={16} aria-hidden="true" /> Archive
                    </Button>
                  )}
                </div>
              )}
              {product.status === 'ACTIVE' && (
                <a
                  href={`/product/${product.slug}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 text-small font-medium text-primary-dark"
                >
                  View on store <ExternalLink size={14} aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </Section>
          )}

          <Section id="sec-organise" title="Organisation">
            <FormField label="Category" required error={err('categoryId')}>
              <Select {...text('categoryId')}>
                <option value="">Choose a category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {' '.repeat(c.depth)}
                    {c.name}
                    {c.isActive ? '' : ' (hidden)'}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Brand" error={err('brandId')}>
              <Select {...text('brandId')}>
                <option value="">No brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label="Search tags"
              hint="Comma-separated words shoppers might search for"
              error={err('tags')}
            >
              <Input {...text('tags')} />
            </FormField>
            <Checkbox
              label="Featured"
              description="Eligible for featured sections on the homepage"
              checked={s.isFeatured}
              disabled={!canWrite}
              onChange={(e) => set('isFeatured', e.target.checked)}
            />
          </Section>

          <Section id="sec-tax" title="Tax">
            <FormField label="GST rate" required error={err('taxRate')}>
              <Select {...text('taxRate')}>
                {GST_RATES.map((r) => (
                  <option key={r} value={String(r)}>
                    {r}%
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label="HSN code"
              hint="4, 6 or 8 digits; printed on invoices"
              error={err('hsnCode')}
            >
              <Input {...text('hsnCode')} inputMode="numeric" maxLength={8} />
            </FormField>
            {priceSummary.length > 0 && (
              <p className="text-caption text-text-muted">
                GST included in {formatINR(Math.min(...priceSummary))}:{' '}
                {formatINR(
                  Math.round(
                    (Math.min(...priceSummary) * Number(s.taxRate)) / (100 + Number(s.taxRate)),
                  ),
                )}
              </p>
            )}
          </Section>

          {product && canWrite && (
            <Section id="sec-more" title="More actions">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const copy = await api.post<AdminProductDto>(
                      `/admin/products/${product.id}/duplicate`,
                    );
                    toast({ title: 'Copy created as a draft', variant: 'success' });
                    router.push(`/admin/products/${copy.id}`);
                  } catch (e) {
                    setFormError(e instanceof ApiError ? e.message : 'Couldn’t copy the product.');
                  }
                }}
              >
                <Copy size={16} aria-hidden="true" /> Duplicate
              </Button>
              {canDelete && (
                <Button
                  variant="outline"
                  className="text-error-text"
                  onClick={() => setConfirm('delete')}
                >
                  <Trash2 size={16} aria-hidden="true" /> Delete permanently
                </Button>
              )}
              {product.hasOrders && canDelete && (
                <p className="text-caption text-text-muted">
                  This product has orders, so it can only be archived, not deleted.
                </p>
              )}
            </Section>
          )}
        </aside>
      </div>

      {product && (
        <>
          <ConfirmDialog
            open={confirm === 'unpublish'}
            onClose={() => setConfirm(null)}
            title="Unpublish this product?"
            description="It disappears from the store and search. Carts that contain it can’t check out until it’s live again."
            confirmLabel="Unpublish"
            onConfirm={() => changeStatus('DRAFT')}
          />
          <ConfirmDialog
            open={confirm === 'archive'}
            onClose={() => setConfirm(null)}
            title="Archive this product?"
            description="Archived products are hidden from the store and search. Order history is kept, and you can publish it again later."
            confirmLabel="Archive"
            onConfirm={() => changeStatus('ARCHIVED')}
          />
          <ConfirmDialog
            open={confirm === 'delete'}
            onClose={() => setConfirm(null)}
            title="Delete this product permanently?"
            description="This removes the product, its variants, images and stock history. It can’t be undone."
            confirmLabel="Delete"
            danger
            onConfirm={async () => {
              await api.delete(`/admin/products/${product.id}`);
              toast({ title: 'Product deleted', variant: 'success' });
              router.replace('/admin/products');
              router.refresh();
            }}
          />
        </>
      )}
    </form>
  );
}

function VariantCard({
  index,
  v,
  count,
  err,
  disabled,
  onChange,
  onRemove,
  productId,
}: {
  index: number;
  v: VariantDraft;
  count: number;
  err: (field: string) => string | undefined;
  disabled: boolean;
  onChange: (patch: Partial<VariantDraft>) => void;
  onRemove: () => void;
  productId?: string;
}) {
  const bind = (key: keyof VariantDraft) => ({
    name: `variants.${index}.${key}`,
    value: v[key] as string,
    onChange: (e: { target: { value: string } }) => onChange({ [key]: e.target.value }),
    disabled,
  });
  const mrp = rupeesToPaise(v.mrp);
  const price = rupeesToPaise(v.price);
  const off = mrp && price && mrp > price ? Math.floor(((mrp - price) / mrp) * 100) : 0;
  const label = v.name || v.sku || `Variant ${index + 1}`;
  return (
    <fieldset
      className={cn(
        'flex flex-col gap-3 rounded-md border border-border p-3',
        !v.isActive && 'bg-surface-muted/60',
      )}
    >
      <legend className="px-1 text-small font-semibold">
        {label}
        {!v.isActive && <span className="font-normal text-text-muted"> (inactive)</span>}
      </legend>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FormField label="SKU" required error={err('sku')}>
          <Input size="sm" {...bind('sku')} maxLength={64} spellCheck={false} />
        </FormField>
        <FormField label="Name" required hint="e.g. Black / 128 GB" error={err('name')}>
          <Input size="sm" {...bind('name')} maxLength={120} />
        </FormField>
        <FormField
          label="Options"
          hint="e.g. Colour: Black | Storage: 128 GB"
          error={err('options')}
        >
          <Input size="sm" {...bind('options')} />
        </FormField>
        <FormField label="MRP (₹)" required error={err('mrp')}>
          <Input size="sm" {...bind('mrp')} inputMode="decimal" />
        </FormField>
        <FormField
          label="Selling price (₹)"
          required
          hint={off ? `${off}% off MRP` : undefined}
          error={err('price')}
        >
          <Input size="sm" {...bind('price')} inputMode="decimal" />
        </FormField>
        <FormField label="Weight (g)" error={err('weightGrams')}>
          <Input size="sm" {...bind('weightGrams')} inputMode="numeric" />
        </FormField>
        {v.id ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-small font-medium">Stock</span>
            <p className="text-small tabular-nums">
              {v.stock} in stock{v.reserved ? `, ${v.reserved} reserved` : ''}
            </p>
            {productId && (
              <Link
                href={`/admin/inventory?q=${encodeURIComponent(v.sku)}`}
                className="text-caption font-medium text-primary-dark"
              >
                Adjust in Inventory
              </Link>
            )}
          </div>
        ) : (
          <FormField label="Opening stock" error={err('initialStock')}>
            <Input size="sm" {...bind('initialStock')} inputMode="numeric" />
          </FormField>
        )}
        <FormField label="Low-stock alert at" hint="Units left" error={err('lowStockThreshold')}>
          <Input size="sm" {...bind('lowStockThreshold')} inputMode="numeric" />
        </FormField>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Checkbox
            label="Active"
            checked={v.isActive}
            disabled={disabled}
            onChange={(e) => onChange({ isActive: e.target.checked })}
          />
          <Radio
            name="default-variant"
            label="Default choice"
            checked={v.isDefault}
            disabled={disabled}
            onChange={() => onChange({ isDefault: true })}
          />
        </div>
        {!disabled && count > 1 && (
          <Button size="sm" variant="ghost" className="text-error-text" onClick={onRemove}>
            <Trash2 size={14} aria-hidden="true" /> Remove {label}
          </Button>
        )}
      </div>
      {v.hasOrders && (
        <p className="text-caption text-text-muted">
          Ordered before: removing it keeps it as inactive so order history stays intact.
        </p>
      )}
    </fieldset>
  );
}

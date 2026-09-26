import type { BannerPlacement, BannerTheme, HomeSectionSource } from './enums';

/** Catalogue contracts. Money in paise; images are absolute or site-relative URLs. */

export interface ImageDto {
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface BrandRef {
  id: string;
  name: string;
  slug: string;
}

export type ProductBadge = 'NEW' | 'BESTSELLER' | 'DEAL';
export type StockState = 'in_stock' | 'low_stock' | 'out_of_stock';

/** Listing card data (grids, rails, search results, wishlist). */
export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  brand: BrandRef | null;
  category: CategoryRef;
  image: ImageDto | null;
  /** Default purchasable variant (for one-tap "Add to cart" from cards). */
  defaultVariantId: string | null;
  hasMultipleVariants: boolean;
  /** Price and MRP of the cheapest active variant. */
  price: number;
  mrp: number;
  /** Largest discount across active variants (for "up to X% off"). */
  maxDiscountPercent: number;
  /** Aggregated from approved reviews only; 0/0 when there are none. */
  ratingAvg: number;
  ratingCount: number;
  stock: StockState;
  available: number;
  badges: ProductBadge[];
}

export interface VariantDto {
  id: string;
  sku: string;
  name: string;
  options: Record<string, string>;
  mrp: number;
  price: number;
  available: number;
  stock: StockState;
  isDefault: boolean;
  /** Images specific to this variant (e.g. a colour); empty = use product images. */
  imageIds: string[];
}

export interface SpecificationDto {
  label: string;
  value: string;
}

export interface ProductDetail extends Omit<ProductSummary, 'image'> {
  sku: string;
  shortDescription: string;
  description: string;
  highlights: string[];
  specifications: SpecificationDto[];
  tags: string[];
  images: (ImageDto & { id: string })[];
  videoUrl: string | null;
  variants: VariantDto[];
  /** Option names in display order, e.g. ["Colour", "Storage"]. */
  optionNames: string[];
  taxRate: number;
  hsnCode: string | null;
  weightGrams: number | null;
  dimensions: { lengthMm: number; widthMm: number; heightMm: number } | null;
  shippingInfo: string | null;
  returnInfo: string | null;
  warrantyInfo: string | null;
  isReturnable: boolean;
  returnWindowDays: number;
  isCodAvailable: boolean;
  /** Root → leaf category path. */
  breadcrumbs: CategoryRef[];
  metaTitle: string | null;
  metaDescription: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface CategoryNode extends CategoryRef {
  description: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
  children: CategoryNode[];
}

export interface CategoryDetail extends CategoryRef {
  description: string | null;
  seoContent: string | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  breadcrumbs: CategoryRef[];
  children: (CategoryRef & { imageUrl: string | null })[];
}

export interface BrandDto extends BrandRef {
  description: string | null;
  logoUrl: string | null;
  isFeatured: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
}

export interface ProductFacets {
  categories: FacetValue[];
  brands: FacetValue[];
  /** Paise. */
  priceRange: { min: number; max: number };
  inStockCount: number;
}

export interface ProductListResult {
  items: ProductSummary[];
  facets: ProductFacets;
  /** The search text, when this listing is a search. */
  query: string | null;
  /** Set when a probable typo was corrected ("Showing results for …"). */
  correctedQuery: string | null;
}

export interface BannerDto {
  id: string;
  title: string;
  subtitle: string | null;
  ctaLabel: string | null;
  link: string | null;
  placement: BannerPlacement;
  theme: BannerTheme;
  imageDesktop: string | null;
  imageTablet: string | null;
  imageMobile: string | null;
  imageAlt: string | null;
}

export interface HomeSectionDto {
  id: string;
  title: string;
  subtitle: string | null;
  source: HomeSectionSource;
  viewAllHref: string;
  products: ProductSummary[];
}

export interface HomePageDto {
  heroBanners: BannerDto[];
  promoBanners: BannerDto[];
  featuredCategories: CategoryNode[];
  sections: HomeSectionDto[];
  featuredBrands: BrandDto[];
}

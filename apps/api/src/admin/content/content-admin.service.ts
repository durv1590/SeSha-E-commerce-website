import { HttpStatus, Injectable } from '@nestjs/common';
import type { Banner, Page, Prisma, SeoOverride } from '@prisma/client';
import type {
  AdminBannerDto,
  AdminHomeSectionDto,
  AdminPageDto,
  AdminSeoOverrideDto,
} from '@seshakart/types';
import {
  SETTINGS_SCHEMAS,
  type BannerInput,
  type HomeSectionInput,
  type PageInput,
  type SeoOverrideInput,
  type SettingsKey,
  type SettingsValue,
} from '@seshakart/validation';
import { AuditService } from '../../audit/audit.service';
import { RevalidationService } from '../../cache/revalidation.service';
import { AppException } from '../../common/filters/all-exceptions.filter';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import type { Actor } from '../actor';
import { resolveSlug } from '../catalog/slug';

const notFound = (what: string) =>
  new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `This ${what} doesn’t exist.`);

export function bannerState(b: Banner, now = new Date()): AdminBannerDto['state'] {
  if (!b.isActive) return 'off';
  if (b.endsAt && b.endsAt <= now) return 'ended';
  if (b.startsAt && b.startsAt > now) return 'scheduled';
  return 'live';
}

/**
 * Banners, homepage sections, CMS pages, SEO overrides and store settings. Every
 * change is audit-logged and refreshes the storefront caches it affects.
 */
@Injectable()
export class ContentAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
    private readonly settings: SettingsService,
  ) {}

  private log(
    actor: Actor,
    action: string,
    entityType: string,
    entityId: string | null,
    metadata: Prisma.InputJsonValue,
    tx?: Prisma.TransactionClient,
  ) {
    return this.audit.record(
      {
        actorId: actor.userId,
        action,
        entityType,
        entityId,
        metadata,
        ip: actor.ip,
        userAgent: actor.userAgent,
      },
      tx,
    );
  }

  // ------------------------------------------------------------------ banners

  async banners(): Promise<AdminBannerDto[]> {
    const rows = await this.prisma.banner.findMany({
      orderBy: [{ placement: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(bannerDto);
  }

  async saveBanner(id: string | null, input: BannerInput, actor: Actor): Promise<AdminBannerDto> {
    if (id && !(await this.prisma.banner.findUnique({ where: { id } }))) throw notFound('banner');
    const row = await this.prisma.$transaction(async (tx) => {
      const b = id
        ? await tx.banner.update({ where: { id }, data: input })
        : await tx.banner.create({ data: input });
      await this.log(
        actor,
        id ? 'banner.updated' : 'banner.created',
        'banner',
        b.id,
        { title: b.title, placement: b.placement },
        tx,
      );
      return b;
    });
    await this.revalidation.catalogChanged();
    return bannerDto(row);
  }

  async deleteBanner(id: string, actor: Actor): Promise<void> {
    const b = await this.prisma.banner.findUnique({ where: { id } });
    if (!b) throw notFound('banner');
    await this.prisma.$transaction(async (tx) => {
      await tx.banner.delete({ where: { id } });
      await this.log(actor, 'banner.deleted', 'banner', id, { title: b.title }, tx);
    });
    await this.revalidation.catalogChanged();
  }

  // ------------------------------------------------------------ home sections

  async sections(): Promise<AdminHomeSectionDto[]> {
    const rows = await this.prisma.homeSection.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: { category: { select: { name: true } } },
    });
    return rows.map((s) => ({
      id: s.id,
      title: s.title,
      subtitle: s.subtitle,
      source: s.source,
      categoryId: s.categoryId,
      categoryName: s.category?.name ?? null,
      limit: s.limit,
      position: s.position,
      isActive: s.isActive,
    }));
  }

  async saveSection(
    id: string | null,
    input: HomeSectionInput,
    actor: Actor,
  ): Promise<AdminHomeSectionDto[]> {
    if (id && !(await this.prisma.homeSection.findUnique({ where: { id } })))
      throw notFound('section');
    if (
      input.categoryId &&
      !(await this.prisma.category.findUnique({ where: { id: input.categoryId } }))
    )
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_FAILED',
        'Choose a category.',
        [{ path: 'categoryId', message: 'This category doesn’t exist' }],
      );
    await this.prisma.$transaction(async (tx) => {
      const position = id
        ? undefined
        : ((await tx.homeSection.aggregate({ _max: { position: true } }))._max.position ?? -1) + 1;
      const s = id
        ? await tx.homeSection.update({ where: { id }, data: input })
        : await tx.homeSection.create({ data: { ...input, position: position! } });
      await this.log(
        actor,
        id ? 'home_section.updated' : 'home_section.created',
        'home_section',
        s.id,
        { title: s.title, source: s.source },
        tx,
      );
    });
    await this.revalidation.catalogChanged();
    return this.sections();
  }

  /** Sets the display order: `ids` must list every section exactly once. */
  async reorderSections(ids: string[], actor: Actor): Promise<AdminHomeSectionDto[]> {
    const all = await this.prisma.homeSection.findMany({ select: { id: true } });
    const known = new Set(all.map((s) => s.id));
    if (
      ids.length !== all.length ||
      new Set(ids).size !== ids.length ||
      ids.some((i) => !known.has(i))
    )
      throw new AppException(
        HttpStatus.CONFLICT,
        'STALE_ORDER',
        'The list of sections changed. Reload the page and try again.',
      );
    await this.prisma.$transaction(async (tx) => {
      for (const [position, id] of ids.entries())
        await tx.homeSection.update({ where: { id }, data: { position } });
      await this.log(actor, 'home_section.reordered', 'home_section', null, { ids }, tx);
    });
    await this.revalidation.catalogChanged();
    return this.sections();
  }

  async deleteSection(id: string, actor: Actor): Promise<AdminHomeSectionDto[]> {
    const s = await this.prisma.homeSection.findUnique({ where: { id } });
    if (!s) throw notFound('section');
    await this.prisma.$transaction(async (tx) => {
      await tx.homeSection.delete({ where: { id } });
      await this.log(actor, 'home_section.deleted', 'home_section', id, { title: s.title }, tx);
    });
    await this.revalidation.catalogChanged();
    return this.sections();
  }

  // -------------------------------------------------------------------- pages

  async pages(): Promise<AdminPageDto[]> {
    const rows = await this.prisma.page.findMany({ orderBy: { title: 'asc' } });
    return this.pageDtos(rows);
  }

  async page(id: string): Promise<AdminPageDto> {
    const p = await this.prisma.page.findUnique({ where: { id } });
    if (!p) throw notFound('page');
    return (await this.pageDtos([p]))[0]!;
  }

  async savePage(id: string | null, input: PageInput, actor: Actor): Promise<AdminPageDto> {
    const current = id ? await this.prisma.page.findUnique({ where: { id } }) : null;
    if (id && !current) throw notFound('page');
    const slug =
      current && input.slug === current.slug
        ? current.slug
        : await resolveSlug(input.slug, input.title, async (s) => {
            const f = await this.prisma.page.findUnique({
              where: { slug: s },
              select: { id: true },
            });
            return Boolean(f && f.id !== id);
          });
    const data = {
      title: input.title,
      slug,
      content: input.content,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      isPublished: input.isPublished,
      updatedById: actor.userId,
    };
    const row = await this.prisma.$transaction(async (tx) => {
      const p = id ? await tx.page.update({ where: { id }, data }) : await tx.page.create({ data });
      await this.log(
        actor,
        id ? 'page.updated' : 'page.created',
        'page',
        p.id,
        { slug, isPublished: p.isPublished },
        tx,
      );
      return p;
    });
    await this.revalidation.contentChanged();
    return (await this.pageDtos([row]))[0]!;
  }

  async deletePage(id: string, actor: Actor): Promise<void> {
    const p = await this.prisma.page.findUnique({ where: { id } });
    if (!p) throw notFound('page');
    await this.prisma.$transaction(async (tx) => {
      await tx.page.delete({ where: { id } });
      await this.log(actor, 'page.deleted', 'page', id, { slug: p.slug }, tx);
    });
    await this.revalidation.contentChanged();
  }

  private async pageDtos(rows: Page[]): Promise<AdminPageDto[]> {
    const ids = [...new Set(rows.flatMap((r) => (r.updatedById ? [r.updatedById] : [])))];
    const users = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      ).map((u) => [u.id, u.name]),
    );
    return rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      content: p.content,
      metaTitle: p.metaTitle,
      metaDescription: p.metaDescription,
      isPublished: p.isPublished,
      updatedBy: p.updatedById ? (users.get(p.updatedById) ?? null) : null,
      updatedAt: p.updatedAt.toISOString(),
    }));
  }

  // ---------------------------------------------------------------------- SEO

  async seo(): Promise<AdminSeoOverrideDto[]> {
    return (await this.prisma.seoOverride.findMany({ orderBy: { path: 'asc' } })).map(seoDto);
  }

  async saveSeo(
    id: string | null,
    input: SeoOverrideInput,
    actor: Actor,
  ): Promise<AdminSeoOverrideDto> {
    if (id && !(await this.prisma.seoOverride.findUnique({ where: { id } })))
      throw notFound('SEO rule');
    const clash = await this.prisma.seoOverride.findUnique({ where: { path: input.path } });
    if (clash && clash.id !== id)
      throw new AppException(
        HttpStatus.CONFLICT,
        'SEO_PATH_EXISTS',
        'This page already has SEO settings.',
        [{ path: 'path', message: 'Edit the existing entry for this page instead' }],
      );
    if (!input.title && !input.description && !input.ogImage && !input.noindex)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_FAILED',
        'Set at least one value.',
        [{ path: 'title', message: 'Set a title, description, image or hide from search engines' }],
      );
    const row = await this.prisma.$transaction(async (tx) => {
      const s = id
        ? await tx.seoOverride.update({ where: { id }, data: input })
        : await tx.seoOverride.create({ data: input });
      await this.log(
        actor,
        id ? 'seo.updated' : 'seo.created',
        'seo_override',
        s.id,
        { path: s.path, noindex: s.noindex },
        tx,
      );
      return s;
    });
    await this.revalidation.contentChanged();
    return seoDto(row);
  }

  async deleteSeo(id: string, actor: Actor): Promise<void> {
    const s = await this.prisma.seoOverride.findUnique({ where: { id } });
    if (!s) throw notFound('SEO rule');
    await this.prisma.$transaction(async (tx) => {
      await tx.seoOverride.delete({ where: { id } });
      await this.log(actor, 'seo.deleted', 'seo_override', id, { path: s.path }, tx);
    });
    await this.revalidation.contentChanged();
  }

  // ----------------------------------------------------------------- settings

  getSettings<K extends SettingsKey>(key: K): Promise<SettingsValue<K>> {
    return this.settings.get(key);
  }

  /** Replaces a settings group; the body was validated against its schema by the controller. */
  async saveSettings<K extends SettingsKey>(
    key: K,
    body: unknown,
    actor: Actor,
  ): Promise<SettingsValue<K>> {
    const parsed = SETTINGS_SCHEMAS[key].safeParse(body);
    if (!parsed.success)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_FAILED',
        'Some of the information provided is not valid.',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    return this.settings.update(key, parsed.data as Partial<SettingsValue<K>>, actor.userId);
  }
}

function bannerDto(b: Banner): AdminBannerDto {
  return {
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    ctaLabel: b.ctaLabel,
    link: b.link,
    placement: b.placement,
    theme: b.theme,
    imageDesktop: b.imageDesktop,
    imageTablet: b.imageTablet,
    imageMobile: b.imageMobile,
    imageAlt: b.imageAlt,
    startsAt: b.startsAt?.toISOString() ?? null,
    endsAt: b.endsAt?.toISOString() ?? null,
    priority: b.priority,
    isActive: b.isActive,
    state: bannerState(b),
    updatedAt: b.updatedAt.toISOString(),
  };
}

function seoDto(s: SeoOverride): AdminSeoOverrideDto {
  return {
    id: s.id,
    path: s.path,
    title: s.title,
    description: s.description,
    ogImage: s.ogImage,
    noindex: s.noindex,
    updatedAt: s.updatedAt.toISOString(),
  };
}

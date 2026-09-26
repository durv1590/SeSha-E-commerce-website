import { Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import { formatPhone, getPublicSettings } from '@/lib/settings/public';
import { Logo } from '../brand/Logo';

export async function SiteFooter() {
  const s = await getPublicSettings();
  return (
    <footer className="mt-section bg-navy text-text-inverse">
      <div className="container-page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <Logo tone="reversed" height={36} />
          <p className="max-w-sm text-small text-text-inverse/80">
            {s.tagline}. More choices, more value and fast delivery across India.
          </p>
        </div>
        <nav aria-label="Account">
          <h2 className="mb-3 text-h5 text-text-inverse">Your account</h2>
          <ul className="flex flex-col gap-1 text-small">
            {[
              ['/login', 'Sign in'],
              ['/register', 'Create account'],
              ['/account', 'My account'],
              ['/account/addresses', 'Saved addresses'],
            ].map(([href, label]) => (
              <li key={href}>
                <Link
                  href={href!}
                  className="inline-flex min-h-6 items-center text-text-inverse/85 no-underline hover:text-accent hover:underline"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="mb-3 text-h5 text-text-inverse">Contact us</h2>
          <ul className="flex flex-col gap-2 text-small">
            <li>
              <a
                href={`mailto:${s.supportEmail}`}
                className="inline-flex min-h-6 items-center gap-2 break-all text-text-inverse/85 no-underline hover:text-accent"
              >
                <Mail size={16} aria-hidden="true" className="shrink-0" />
                {s.supportEmail}
              </a>
            </li>
            <li>
              <a
                href={`tel:+91${s.supportPhone}`}
                className="inline-flex min-h-6 items-center gap-2 whitespace-nowrap text-text-inverse/85 no-underline hover:text-accent"
              >
                <Phone size={16} aria-hidden="true" />
                {formatPhone(s.supportPhone)}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-text-inverse/15">
        <p className="container-page py-4 text-caption text-text-inverse/70">
          © {new Date().getFullYear()} {s.legalName} · All rights reserved.
        </p>
      </div>
    </footer>
  );
}

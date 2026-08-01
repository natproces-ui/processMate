import { Quote, Star } from 'lucide-react';
import { getVideoEmbedUrl } from '@/lib/video';
import type { Testimonial } from '@/types/testimonial';

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5 mb-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
      ))}
    </div>
  );
}

export default function TestimonialCard({ testimonial: t }: { testimonial: Testimonial }) {
  if (t.type === 'video') {
    const embedUrl = t.video_url ? getVideoEmbedUrl(t.video_url) : null;
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="aspect-video bg-slate-900">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              title={t.name}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">Vidéo indisponible</div>
          )}
        </div>
        <div className="p-6">
          {t.rating && <Stars rating={t.rating} />}
          {t.quote && <p className="text-sm text-slate-700 mb-4">&ldquo;{t.quote}&rdquo;</p>}
          <div className="text-sm font-semibold">{t.name}</div>
          {t.role && <div className="text-xs text-slate-500">{t.role}</div>}
        </div>
      </div>
    );
  }

  if (t.type === 'photo' && t.photo_url) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="h-48 bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.photo_url} alt={t.name} className="w-full h-full object-cover" />
        </div>
        <div className="p-6">
          {t.rating && <Stars rating={t.rating} />}
          {t.quote && <p className="text-sm text-slate-700 mb-4">&ldquo;{t.quote}&rdquo;</p>}
          <div className="text-sm font-semibold">{t.name}</div>
          {t.role && <div className="text-xs text-slate-500">{t.role}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <Quote className="w-6 h-6 text-emerald-200 mb-3" />
      {t.rating && <Stars rating={t.rating} />}
      {t.quote && <p className="text-sm text-slate-700 mb-4">&ldquo;{t.quote}&rdquo;</p>}
      <div className="text-sm font-semibold">{t.name}</div>
      {t.role && <div className="text-xs text-slate-500">{t.role}</div>}
    </div>
  );
}

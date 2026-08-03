'use client'

export default function GuideSection({ title, children }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h3>
      <div className="text-[13px] leading-relaxed text-gray-700">{children}</div>
    </section>
  )
}

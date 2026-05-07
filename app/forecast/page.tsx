export const dynamic = 'force-dynamic';

export default function ForecastPage() {
  return (
    <div className="anim-fade-in" style={{ height: 'calc(100vh - 64px)' }}>
      <iframe
        src="/forecast-tool.html"
        title="Empower Revenue Forecast tool"
        className="w-full h-full border-0"
      />
    </div>
  );
}

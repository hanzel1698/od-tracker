/** The limit-utilisation bar; turns red past 85%, as the Android app did. */
export function Meter({ ratio, large = false }: { ratio: number; large?: boolean }) {
  const percent = Math.round(ratio * 100)
  return (
    <div
      className={large ? 'meter meter-lg' : 'meter'}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Limit utilisation"
    >
      <div
        className={ratio > 0.85 ? 'meter-fill is-high' : 'meter-fill'}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

/**
 * 数字步进器：- [value] +
 * step: 步进值，默认1（整数），传0.1可支持小数
 */
export default function NumStepper({ value, min = 1, max = 32, step = 1, onChange }) {
  function set(v) {
    // 根据 step 自动计算小数位数：step=0.01→2位，step=0.1→1位，step=1→0位
    const decimals = step < 1 ? Math.max(0, Math.round(-Math.log10(step))) : 0
    const factor = Math.pow(10, decimals)
    const rounded = Math.round(v * factor) / factor
    const clamped = Math.max(min, Math.min(max, rounded))
    if (clamped !== value) onChange(clamped)
  }

  return (
    <div className="num-stepper">
      <button onClick={() => set(value - step)} disabled={value <= min} aria-label="减少">−</button>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => {
          const parsed = parseFloat(e.target.value)
          set(isNaN(parsed) ? min : parsed)
        }}
      />
      <button onClick={() => set(value + step)} disabled={value >= max} aria-label="增加">+</button>
    </div>
  )
}

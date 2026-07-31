import { COUNTRY_DIALS, findDial } from '../constants/phone'
import { digitsOnly } from '../utils/forms'
import styles from '../styles/flow.module.scss'

type Props = {
  id?: string
  label?: string
  required?: boolean
  countryCode: string
  localNumber: string
  onCountryChange: (code: string) => void
  onNumberChange: (value: string) => void
}

export default function PhoneField({
  id = 'telefono',
  label = 'Teléfono',
  required = true,
  countryCode,
  localNumber,
  onCountryChange,
  onNumberChange,
}: Props) {
  const country = findDial(countryCode)

  return (
    <div className={styles.group}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required ? <span className={styles.required}>*</span> : null}
      </label>
      <div className={styles.phoneRow}>
        <select
          className={styles.phoneCountry}
          aria-label="País / lada"
          value={countryCode}
          onChange={(e) => onCountryChange(e.target.value)}
        >
          {COUNTRY_DIALS.map((item) => (
            <option key={item.code} value={item.code}>
              {item.flag} {item.dial} · {item.name}
            </option>
          ))}
        </select>
        <div className={styles.phoneInputWrap}>
          <span className={styles.phoneDial}>{country.dial}</span>
          <input
            className={styles.phoneInput}
            id={id}
            type="tel"
            inputMode="numeric"
            required={required}
            maxLength={country.maxLen}
            placeholder={'9'.repeat(Math.min(country.maxLen, 10))}
            value={localNumber}
            onInput={(e) => digitsOnly(e, country.maxLen)}
            onChange={(e) => onNumberChange(e.target.value.replace(/\D/g, '').slice(0, country.maxLen))}
          />
        </div>
      </div>
      <p className={styles.phoneHint}>
        {country.flag} {country.name} · lada {country.dial} ·{' '}
        {country.minLen === country.maxLen
          ? `${country.maxLen} dígitos`
          : `${country.minLen}–${country.maxLen} dígitos`}
      </p>
    </div>
  )
}

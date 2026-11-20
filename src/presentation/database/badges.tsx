import { Show, type JSX } from 'solid-js';
import { readableTextOn } from '../../domain/color';
import {
  COLOR_PALETTE,
  effectiveColor,
  ENGINE_BADGES,
  ENGINE_LABELS,
  ENVIRONMENTS,
  type DataSourceConfig,
  type EngineKind,
  type Environment,
} from '../../domain/dataSource';
import '../styles/database.css';

/** Tells providers apart: two letters on a rounded square in the provider's color. Not a brand logo. */
export function ProviderBadge(props: { engine: EngineKind; size?: number }): JSX.Element {
  const badge = () => ENGINE_BADGES[props.engine];
  const size = () => props.size ?? 16;
  return (
    <span
      class="provider-badge"
      role="img"
      aria-label={ENGINE_LABELS[props.engine]}
      title={ENGINE_LABELS[props.engine]}
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        'font-size': `${Math.round(size() * 0.58)}px`,
        background: badge().color,
        color: readableTextOn(badge().color),
      }}
    >
      {badge().text}
    </span>
  );
}

/** A small label such as LOCAL, in the color of its environment. */
export function EnvironmentTag(props: { environment: Environment | null }): JSX.Element {
  const info = () => ENVIRONMENTS.find((e) => e.id === props.environment);
  return (
    <Show when={info()}>
      {(env) => (
        <span class="db-env" style={{ '--env-color': env().color }}>
          {env().label}
        </span>
      )}
    </Show>
  );
}

/** The CSS variable that colors the accent stripe of a connection, or an empty style. */
export function accentStyle(config: Pick<DataSourceConfig, 'color' | 'environment'>): JSX.CSSProperties {
  const color = effectiveColor(config);
  return color ? { '--source-color': color } : {};
}

/** A row of color choices: none, follow the environment, then the palette. */
export function ColorPicker(props: {
  value: string | null;
  onChange: (id: string | null) => void;
  /** Label for the choice that clears the color. */
  noneLabel: string;
}): JSX.Element {
  return (
    <div class="color-picker" role="radiogroup" aria-label="Color">
      <button
        type="button"
        class="color-swatch color-swatch-none"
        role="radio"
        aria-checked={props.value === null}
        title={props.noneLabel}
        onClick={() => props.onChange(null)}
      />
      {COLOR_PALETTE.map((color) => (
        <button
          type="button"
          class="color-swatch"
          role="radio"
          aria-checked={props.value === color.id}
          title={color.label}
          style={{ background: color.value }}
          onClick={() => props.onChange(color.id)}
        />
      ))}
    </div>
  );
}

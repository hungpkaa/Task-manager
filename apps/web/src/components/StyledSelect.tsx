import { Children, isValidElement, useId, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';

type OptionProps = { value?: string | number; disabled?: boolean; children?: ReactNode };
type Props = {
  id?: string;
  value?: string | number;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  required?: boolean;
  children: ReactNode;
  'aria-label'?: string;
};

function optionText(value: ReactNode): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(optionText).join('');
  if (isValidElement<{ children?: ReactNode }>(value)) return optionText(value.props.children);
  return '';
}

export function StyledSelect({ id, value, onChange, disabled = false, required = false, children, 'aria-label': ariaLabel }: Props) {
  const generatedId = useId();
  const listId = `${generatedId}-options`;
  const options = Children.toArray(children).filter((child) => isValidElement<OptionProps>(child) && child.type === 'option').map((child, index) => {
    if (!isValidElement<OptionProps>(child)) return null;
    return { value: String(child.props.value ?? optionText(child.props.children)), label: optionText(child.props.children), disabled: child.props.disabled ?? false, key: child.key ?? `${index}` };
  }).filter((option): option is NonNullable<typeof option> => option !== null);
  const selectedValue = value === undefined ? options[0]?.value ?? '' : String(value);
  const selected = options.find((option) => option.value === selectedValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((option) => option.value === selectedValue)));

  function choose(optionValue: string) {
    if (disabled) return;
    onChange?.({ target: { value: optionValue } } as ChangeEvent<HTMLSelectElement>);
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === optionValue)));
    setOpen(false);
  }

  function moveActive(direction: number) {
    if (!options.length) return;
    let index = activeIndex;
    for (let attempts = 0; attempts < options.length; attempts += 1) {
      index = (index + direction + options.length) % options.length;
      if (!options[index].disabled) break;
    }
    setActiveIndex(index);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(options[activeIndex]?.value ?? selectedValue);
      else setOpen(true);
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const indexes = options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);
      if (indexes.length) setActiveIndex(event.key === 'Home' ? indexes[0] : indexes[indexes.length - 1]);
    } else if (!open && event.key.length === 1) {
      const index = options.findIndex((option) => !option.disabled && option.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
      if (index >= 0) { setActiveIndex(index); choose(options[index].value); }
    }
  }

  return <span className={`styled-select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}>
    <button type="button" id={id} className="styled-select-trigger" role="combobox" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined} aria-required={required || undefined} disabled={disabled} onClick={() => { setActiveIndex(Math.max(0, options.findIndex((option) => option.value === selectedValue))); setOpen((current) => !current); }} onKeyDown={handleKeyDown} onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
      <span>{selected?.label || options[0]?.label || 'Chọn mục'}</span><i aria-hidden="true" />
    </button>
    {required && <input className="styled-select-validity" tabIndex={-1} aria-hidden="true" required value={selectedValue} onChange={() => undefined} />}
    {open && <span className="styled-select-menu" id={listId} role="listbox" aria-label={ariaLabel}>
      {options.map((option, index) => <button type="button" role="option" id={`${listId}-${index}`} aria-selected={option.value === selectedValue} disabled={disabled || option.disabled} key={option.key} className="styled-select-option" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option.value)}>{option.label}</button>)}
    </span>}
  </span>;
}

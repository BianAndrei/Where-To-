import * as SelectPrimitive from "@radix-ui/react-select";
import { Children, type ComponentProps, type ReactNode } from "react";
import { clsx } from "clsx";
import "./select.css";

// Empty strings are meaningful choices in our forms (e.g. the whole trip).
// Radix reserves an empty value for its placeholder, so encode every value.
const encode = (value: string) => `choice:${value}`;

type SelectProps = Omit<
  ComponentProps<typeof SelectPrimitive.Trigger>,
  "value" | "defaultValue" | "onChange" | "children"
> & {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  placeholder?: string;
  name?: string;
  required?: boolean;
};

function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={up ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Select({
  value,
  onValueChange,
  children,
  placeholder = "Choose an option",
  className,
  disabled,
  name,
  required,
  ...triggerProps
}: SelectProps) {
  return (
    <SelectPrimitive.Root
      value={encode(value)}
      onValueChange={(next) => {
        // Radix's hidden native select can emit an empty value while options
        // remount in a conditional form. Only actual encoded choices are input.
        if (next.startsWith("choice:"))
          onValueChange(next.slice("choice:".length));
      }}
      disabled={disabled}
      required={required}
    >
      {name && (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      )}
      <SelectPrimitive.Trigger
        {...triggerProps}
        className={clsx("wt-select-trigger", className)}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon className="wt-select-chevron">
          <Chevron />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="wt-select-content"
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          align="start"
        >
          <SelectPrimitive.ScrollUpButton className="wt-select-scroll">
            <Chevron up />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="wt-select-viewport">
            {children}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="wt-select-scroll">
            <Chevron />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function SelectOption({
  value,
  children,
  disabled,
}: {
  value?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const optionValue = value ?? Children.toArray(children).join("");
  return (
    <SelectPrimitive.Item
      value={encode(optionValue)}
      disabled={disabled}
      className="wt-select-option"
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="wt-select-check">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="m5 12 4 4L19 6"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

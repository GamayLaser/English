import type { ButtonHTMLAttributes } from "react";
import type { ThemeColors } from "../../types";
import { uiButtonClassName, uiButtonStyle, type UiButtonVariant } from "./styles";

export default function Button({
  variant = "secondary",
  c,
  className = "",
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: UiButtonVariant; c: ThemeColors }) {
  return (
    <button
      {...props}
      className={`${uiButtonClassName(variant, props.disabled)} ${className}`}
      style={{ ...uiButtonStyle(variant, c), ...style }}
    />
  );
}

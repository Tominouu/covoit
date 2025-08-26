import React from "react";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "ghost" | "outline" | "default";
};

export const Button: React.FC<ButtonProps> = ({ children, variant, ...props }) => (
  <button {...props} className={`btn-${variant || "default"} ${props.className || ""}`}>
    {children}
  </button>
);

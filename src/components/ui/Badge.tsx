import React from "react";

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> & { variant?: "secondary" | "outline" };
export const Badge: React.FC<BadgeProps> = ({ children, ...props }) => <div {...props}>{children}</div>;

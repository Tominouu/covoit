import React from "react";

export const Toaster: React.FC<React.HTMLAttributes<HTMLDivElement> & { richColors?: boolean }> = (props) => <div {...props}>{props.children}</div>;

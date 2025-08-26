import React from "react";

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { disabled?: boolean }> = (props) => <select {...props}>{props.children}</select>;
export const SelectTrigger: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => <div {...props}>{props.children}</div>;
export const SelectContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => <div {...props}>{props.children}</div>;
export const SelectItem: React.FC<React.HTMLAttributes<HTMLDivElement> & { value: string }> = (props) => <div {...props}>{props.children}</div>;
export const SelectValue: React.FC<React.HTMLAttributes<HTMLDivElement>> = (props) => <div {...props}>{props.children}</div>;

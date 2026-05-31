'use client';
import React from 'react';

export type SlotShape = 'bottle' | 'can' | 'box' | 'cup' | 'bag';

const PALETTE = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6',
  '#f97316', '#06b6d4',
];

export function nameColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return PALETTE[h % PALETTE.length];
}

function Bottle({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 40 70" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <rect x="14" y="2" width="12" height="9" rx="3" fill={color} opacity="0.85"/>
      <rect x="16" y="10" width="8" height="8" fill={color} opacity="0.75"/>
      <rect x="6" y="18" width="28" height="48" rx="13" fill={color}/>
      <rect x="8" y="32" width="24" height="20" rx="5" fill="white" opacity="0.18"/>
      <rect x="10" y="21" width="5" height="20" rx="2.5" fill="white" opacity="0.22"/>
    </svg>
  );
}

function Can({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 40 58" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <ellipse cx="20" cy="10" rx="16" ry="5.5" fill={color} opacity="0.7"/>
      <rect x="4" y="10" width="32" height="36" fill={color}/>
      <ellipse cx="20" cy="46" rx="16" ry="5.5" fill={color} opacity="0.55"/>
      <rect x="4" y="18" width="32" height="20" fill="white" opacity="0.1"/>
      <ellipse cx="20" cy="9" rx="5" ry="2" fill="white" opacity="0.45"/>
      <rect x="18" y="4" width="4" height="6" rx="1" fill="white" opacity="0.45"/>
      <rect x="7" y="13" width="4" height="28" rx="2" fill="white" opacity="0.16"/>
    </svg>
  );
}

function Box({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 44 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <rect x="4" y="17" width="36" height="43" rx="3" fill={color}/>
      <path d="M4 17 L22 7 L22 17Z" fill={color} opacity="0.7"/>
      <path d="M40 17 L22 7 L22 17Z" fill={color} opacity="0.55"/>
      <rect x="8" y="28" width="28" height="20" rx="3" fill="white" opacity="0.18"/>
      <circle cx="22" cy="11" r="2" fill="white" opacity="0.5"/>
      <rect x="7" y="19" width="4" height="32" rx="2" fill="white" opacity="0.18"/>
    </svg>
  );
}

function Cup({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 44 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <ellipse cx="22" cy="12" rx="18" ry="7" fill={color} opacity="0.75"/>
      <rect x="4" y="14" width="36" height="6" rx="2" fill={color}/>
      <path d="M8 20 L12 57 L32 57 L36 20Z" fill={color}/>
      <rect x="11" y="29" width="22" height="16" rx="3" fill="white" opacity="0.18"/>
      <rect x="27" y="2" width="3" height="20" rx="1.5" fill={color} opacity="0.65"/>
      <rect x="11" y="22" width="4" height="28" rx="2" fill="white" opacity="0.18"/>
    </svg>
  );
}

function Bag({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 44 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <path d="M10 8 L34 8 L32 4 L12 4Z" fill={color} opacity="0.65"/>
      <path d="M6 8 Q4 36 8 54 L36 54 Q40 36 38 8Z" fill={color}/>
      <path d="M8 54 L36 54 L34 59 L10 59Z" fill={color} opacity="0.65"/>
      <rect x="11" y="22" width="22" height="18" rx="4" fill="white" opacity="0.18"/>
      <path d="M10 11 Q9 36 11 52" stroke="white" strokeWidth="4" strokeLinecap="round" opacity="0.14"/>
    </svg>
  );
}

export const SHAPES: { id: SlotShape; label: string; Icon: React.FC<{ color: string }> }[] = [
  { id: 'bottle', label: 'ขวด',    Icon: Bottle },
  { id: 'can',    label: 'กระป๋อง', Icon: Can },
  { id: 'box',    label: 'กล่อง',  Icon: Box },
  { id: 'cup',    label: 'แก้ว',   Icon: Cup },
  { id: 'bag',    label: 'ถุง',    Icon: Bag },
];

export function FridgeShapeIcon({
  shape,
  color,
}: {
  shape: SlotShape;
  color: string;
}) {
  const found = SHAPES.find(s => s.id === shape);
  if (!found) return null;
  return <found.Icon color={color} />;
}

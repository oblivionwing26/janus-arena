// A scripted model of the ShopLab pages the purchase agent visits. Not part of the build.

import type { ScriptedPage } from '../infrastructure/browser/scripted-browser.js';

export const SHOPLAB_PAGES: Record<string, ScriptedPage> = {
  '/register': {
    title: 'ShopLab',
    elements: [
      { target: { label: 'Nombre' } },
      { target: { label: 'Email' } },
      { target: { label: 'Contraseña (mínimo 8 caracteres)' }, secret: true },
      { target: { label: 'Dirección de envío' } },
      { target: { role: 'button', name: 'Crear cuenta' }, navigatesTo: '/' },
    ],
  },
  '/login': {
    title: 'ShopLab',
    elements: [
      { target: { label: 'Email' } },
      { target: { label: 'Contraseña' }, secret: true },
      { target: { role: 'link', name: 'Crea una' }, navigatesTo: '/register' },
    ],
  },
  '/': {
    title: 'ShopLab',
    elements: [
      {
        target: { role: 'link', name: 'Taza de cerámica' },
        navigatesTo: '/products/taza-ceramica',
      },
    ],
  },
  '/products/taza-ceramica': {
    title: 'ShopLab',
    elements: [
      { target: { role: 'combobox', name: 'Cantidad' }, options: ['1', '2', '3'] },
      { target: { role: 'button', name: 'Añadir al carrito' }, navigatesTo: '/cart' },
    ],
  },
  '/cart': {
    title: 'ShopLab',
    elements: [{ target: { role: 'link', name: 'Ir a pagar' }, navigatesTo: '/checkout' }],
  },
  '/checkout': {
    title: 'ShopLab',
    elements: [{ target: { role: 'button', name: 'Confirmar pedido' }, navigatesTo: '/orders/7' }],
  },
  '/orders/:id': {
    title: 'ShopLab',
    elements: [{ target: { role: 'heading', name: 'Pedido #7' } }],
  },
};

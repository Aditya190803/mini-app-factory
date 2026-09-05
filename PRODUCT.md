# Product

## Register

product

## Users

Builders who want to turn a natural-language product idea into a working web
application, without assembling the frontend, backend, database, and deployment
workflow themselves.

## Product Purpose

Mini App Factory is a Cloudflare-first application factory. You describe an
application, read the files it produces, and publish them into your own
Cloudflare account.

Every project compiles to one of exactly two shapes, and the shape is derived
from the files rather than set as a mode:

- **Static site**: pages, styles, browser scripts. Uploaded to Cloudflare Pages
  as a plain asset bundle. Nothing billable.
- **Edge app**: the same bundle plus a Worker and, usually, stored data through
  D1, KV, R2, Queues, Vectorize, or Durable Objects, all declared in a manifest
  the user can read and edit.

Everything else, a GitHub mirror or a downloaded zip, is an export of the same
bundle. That is what keeps generated projects portable.

## Brand Personality

Capable, direct, transparent. A trustworthy workshop: active and technical
without being theatrical or cryptic.

## Anti-references

Avoid fake progress, hidden work, generic chatbot chrome, decorative AI
gradients, terminal cosplay, and any interface that conceals a file change or a
deployment consequence. Lovable and v0 are workflow references, never visual
templates.

Avoid the two saturated aesthetic lanes for this category: the indigo-gradient
AI SaaS look, and the cream editorial look people reach for when avoiding it.

## Design Principles

1. Show observable work and concrete outcomes. If progress is not measured, do
   not draw a bar.
2. Keep the conversation, preview, code, and deployment in one continuous
   workflow.
3. Make generated projects portable and built on standard platform tooling.
   Deleting this account should not take the user's app down.
4. Require explicit confirmation before creating any billable or persistent
   cloud resource, and show the exact list first.
5. Preserve a recoverable version after every successful build.
6. Cloudflare is the default destination, not one option among four. Other
   surfaces are described honestly as mirrors or previews.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Keyboard operation throughout, visible focus, semantic
status announcements, reduced-motion support, sufficient contrast, and status
indicators that carry a shape as well as a colour.

const EXTENSION_ATTRS = [
  'bis_skin_checked',
  'bis_register',
  'data-new-gr-c-s-check-loaded',
  'data-gr-ext-installed',
  'cz-shortcut-listen',
]

function stripExtensionAttributes() {
  if (typeof document === 'undefined') return
  for (const attr of EXTENSION_ATTRS) {
    document.querySelectorAll(`[${attr}]`).forEach((node) => {
      node.removeAttribute(attr)
    })
  }
}

stripExtensionAttributes()

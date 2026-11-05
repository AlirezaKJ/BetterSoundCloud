import { mount } from 'svelte'
import '../tokens.css'
import ContextMenu from './ContextMenu.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app is missing from context-menu/index.html')

mount(ContextMenu, { target })

import { mount } from 'svelte'
import '../tokens.css'
import VisualStrip from './VisualStrip.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app is missing from visual-strip/index.html')

mount(VisualStrip, { target })

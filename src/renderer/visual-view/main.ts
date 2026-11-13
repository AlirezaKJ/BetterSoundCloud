import { mount } from 'svelte'
import '../tokens.css'
import VisualView from './VisualView.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app is missing from visual-view/index.html')

mount(VisualView, { target })

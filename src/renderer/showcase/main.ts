import { mount } from 'svelte'
import '../tokens.css'
import Showcase from './Showcase.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app is missing from showcase/index.html')

mount(Showcase, { target })

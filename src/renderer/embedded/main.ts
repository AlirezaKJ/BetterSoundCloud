import { mount } from 'svelte'
import '../tokens.css'
import Embedded from './Embedded.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app is missing from embedded/index.html')

mount(Embedded, { target })

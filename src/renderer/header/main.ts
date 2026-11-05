import { mount } from 'svelte'
import '../tokens.css'
import Header from './Header.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app is missing from header/index.html')

mount(Header, { target })

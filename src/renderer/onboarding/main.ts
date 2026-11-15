import { mount } from 'svelte'
import '../tokens.css'
import Onboarding from './Onboarding.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app is missing from onboarding/index.html')

mount(Onboarding, { target })

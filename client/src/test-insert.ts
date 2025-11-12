console.log('test-insert.ts loaded');

import { supabase } from '../supabase'

async function testInsert() {
  const { data, error } = await supabase
    .from('angle_logs')
    .insert([{ angle: 10, duration_min: 5 }])
  console.log('Inserted:', data, 'Error:', error)
}

testInsert()

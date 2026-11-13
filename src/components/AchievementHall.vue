<script setup>
import {computed,ref,watch,nextTick} from 'vue';
import ProjectCard from './ProjectCard.vue';
import AchievementIcon from './AchievementIcon.vue';
import {ACHIEVEMENTS} from '../data/achievements.js';
const props=defineProps({archive:Object,selected:String});
const emit=defineEmits(['close','replay']);
const selection=ref(props.selected),detail=ref(null);
const unlocked=computed(()=>ACHIEVEMENTS.filter(a=>props.archive.unlocked[a.id]).sort((a,b)=>Date.parse(props.archive.unlocked[b.id])-Date.parse(props.archive.unlocked[a.id])));
const locked=computed(()=>ACHIEVEMENTS.filter(a=>!props.archive.unlocked[a.id]));
const current=computed(()=>unlocked.value.find(a=>a.id===selection.value));
watch(()=>props.selected,id=>selection.value=id);
function choose(id){selection.value=selection.value===id?null:id;}
watch(current,async()=>{await nextTick();detail.value?.scrollIntoView({block:'nearest'});},{immediate:true});
const format=time=>new Date(time).toLocaleString();
</script>
<template>
  <ProjectCard title="成就馆" :request-close="()=>emit('close')">
    <section class="achievement-hall">
      <div class="hall-summary"><span>已解锁 {{unlocked.length}} / {{ACHIEVEMENTS.length}}</span><span>每一步，都有回响</span></div>
      <div class="hall-progress" role="progressbar" aria-label="成就解锁总数" :aria-valuenow="unlocked.length" :aria-valuemax="ACHIEVEMENTS.length" aria-valuemin="0"><span :style="{width:unlocked.length/ACHIEVEMENTS.length*100+'%'}" /></div>
      <h3>已解锁 <small>{{unlocked.length}}</small></h3>
      <p v-if="!unlocked.length" class="hall-empty">还没有解锁的成就。</p>
      <button v-for="item in unlocked" :key="item.id" type="button" class="achievement-row unlocked" :aria-expanded="selection===item.id" @click="choose(item.id)">
        <span class="achievement-art"><AchievementIcon :name="item.icon" /></span>
        <span class="achievement-copy"><strong>{{item.name}}</strong><span>{{item.condition}}</span><time :datetime="archive.unlocked[item.id]">{{format(archive.unlocked[item.id])}}</time></span>
      </button>
      <section v-if="current" ref="detail" class="achievement-detail">
        <strong>{{current.name}}</strong><p>{{current.condition}}</p><p>首次解锁：{{format(archive.unlocked[current.id])}}</p>
        <button type="button" @click="emit('replay',current.id)">重看解锁弹窗</button>
      </section>
      <h3>未解锁 <small>{{locked.length}}</small></h3>
      <!-- 未解锁只输出图标和名称；条件不进入隐藏文本、title 或可访问名称。 -->
      <div v-for="item in locked" :key="item.id" class="achievement-row locked"><span class="achievement-art"><AchievementIcon :name="item.icon" /></span><strong>{{item.name}}</strong></div>
    </section>
  </ProjectCard>
</template>
<style scoped>
.achievement-hall{background:#17212b;color:#eef4f7;padding:14px;border-radius:8px;min-width:0;overflow-wrap:anywhere}.hall-summary{display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;font-size:12px;color:#a1b2c1}.hall-summary>span:first-child{color:#eef4f7}.hall-progress{height:4px;background:#314354;margin:12px 0 18px}.hall-progress span{display:block;height:100%;background:#a6d572}.achievement-hall h3{font-size:14px;margin:18px 0 4px;font-weight:500}.achievement-hall h3 small{color:#a1b2c1;margin-left:6px}.hall-empty{font-size:13px;color:#a1b2c1}.achievement-row{box-sizing:border-box;display:flex;align-items:center;gap:11px;width:100%;min-height:72px;padding:12px 0;border:0;border-bottom:1px solid #314354;background:transparent;text-align:left;color:#eef4f7;border-radius:0}.achievement-art{display:grid;place-items:center;flex:0 0 40px;height:42px;border:1px solid #415461;border-radius:4px;color:#8497a5;background:linear-gradient(145deg,#283c4c,#17252f)}.achievement-art svg{width:23px;height:23px}.unlocked .achievement-art{color:#e6c881;border-color:#776b48;background:linear-gradient(145deg,#5a5135,#2c302c)}.achievement-copy{display:flex;flex-direction:column;gap:4px;min-width:0}.achievement-row strong{font-weight:500;font-size:14px}.achievement-copy span,.achievement-copy time{font-size:12px;color:#a1b2c1}.locked strong{color:#b6c4ce}.achievement-detail{margin-top:16px;padding:14px;background:#1d2b38;border:1px solid #314354;border-radius:8px;font-size:13px}.achievement-detail p{color:#a1b2c1;margin:8px 0}.achievement-detail button{display:block;margin:12px 0 0 auto;min-height:44px;padding:8px 12px;color:#d9edbe;background:#334733;border:1px solid #53654b;border-radius:5px;font-size:13px}
</style>

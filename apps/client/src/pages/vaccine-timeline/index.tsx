import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { recordApi } from '../../utils/request'
import { calculateAge, formatDate } from '../../utils/date'
import { getCurrentVaccineStage, VACCINE_SCHEDULE, VaccineScheduleItem } from '../../utils/vaccineSchedule'
import './index.scss'

interface VaccineRecord {
  id: string
  startTime: string
  vaccineName?: string
  vaccineHospital?: string
  vaccineScheduleItemId?: string
  isCustomVaccine?: boolean
}

const ageGroups = Array.from(new Set(VACCINE_SCHEDULE.map((item) => item.ageMonths)))

export default function VaccineTimelinePage() {
  const { isLoggedIn } = useAuthStore()
  const { currentBaby } = useBabyStore()
  const [records, setRecords] = useState<VaccineRecord[]>([])
  const [loading, setLoading] = useState(false)

  const loadData = async () => {
    if (!isLoggedIn) return
    try {
      setLoading(true)
      await useBabyStore.getState().fetchBabies()
      const baby = useBabyStore.getState().currentBaby
      if (!baby) return
      const res = await recordApi.getVaccines(baby.id)
      setRecords(res.data || [])
    } catch (error) {
      Taro.showToast({ title: '加载疫苗记录失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadData()
  })

  const baby = currentBaby || useBabyStore.getState().currentBaby
  if (!baby) {
    return (
      <View className="timeline-page timeline-empty">
        <Text className="empty-icon">💉</Text>
        <Text className="empty-title">先添加宝宝信息</Text>
        <Text className="empty-desc">填写出生日期后，即可查看月龄疫苗参考时间轴</Text>
      </View>
    )
  }

  const age = calculateAge(baby.birthday)
  const currentItems = getCurrentVaccineStage(age.months)
  const recordByScheduleItem = new Map(records
    .filter((record) => record.vaccineScheduleItemId)
    .map((record) => [record.vaccineScheduleItemId as string, record]))
  const matchedRecordIds = new Set(Array.from(recordByScheduleItem.values()).map((record) => record.id))
  const customRecords = records.filter((record) => !matchedRecordIds.has(record.id))

  const goToRecord = (item: VaccineScheduleItem) => {
    Taro.navigateTo({
      url: `/pages/record/index?type=vaccine&babyId=${baby.id}&scheduleItemId=${item.id}`,
    })
  }

  return (
    <View className="timeline-page">
      <View className="timeline-hero">
        <Text className="timeline-baby-name">{baby.name}</Text>
        <Text className="timeline-age">{age.months}个月{age.days}天</Text>
        <View className="timeline-current-stage">
          <Text className="timeline-current-label">当前关注阶段</Text>
          <Text className="timeline-current-value">
            {currentItems[0]?.ageLabel || '常规接种阶段'}
          </Text>
        </View>
      </View>

      <View className="timeline-disclaimer">
        <Text>本时间轴为国家免疫规划常规接种参考，品种、联合疫苗替代及补种安排请以接种门诊和接种证为准。</Text>
      </View>

      {loading ? (
        <View className="timeline-loading"><Text>加载中...</Text></View>
      ) : (
        <View className="timeline-list">
          {ageGroups.map((ageMonths) => {
            const items = VACCINE_SCHEDULE.filter((item) => item.ageMonths === ageMonths)
            const isCurrent = items.some((item) => currentItems.some((current) => current.id === item.id))
            return (
              <View key={ageMonths} className={`timeline-group${isCurrent ? ' current' : ''}`}>
                <View className="timeline-marker"><View className="timeline-dot" /></View>
                <View className="timeline-content">
                  <View className="timeline-group-title">
                    <Text>{items[0].ageLabel}</Text>
                    {isCurrent && <Text className="current-badge">当前阶段</Text>}
                  </View>
                  {items.map((item) => {
                    const record = recordByScheduleItem.get(item.id)
                    return (
                      <View key={item.id} className={`vaccine-item${record ? ' completed' : ''}`} onClick={() => !record && goToRecord(item)}>
                        <View className="vaccine-item-main">
                          <Text className="vaccine-name">{item.displayName}</Text>
                          {item.note && <Text className="vaccine-note">{item.note}</Text>}
                          {record && (
                            <Text className="vaccine-record-info">
                              已记录 {formatDate(record.startTime)}{record.vaccineHospital ? ` · ${record.vaccineHospital}` : ''}
                            </Text>
                          )}
                        </View>
                        <Text className={`vaccine-status${record ? ' done' : ''}`}>{record ? '已接种' : '记录接种'}</Text>
                      </View>
                    )
                  })}
                </View>
              </View>
            )
          })}
        </View>
      )}

      {customRecords.length > 0 && (
        <View className="custom-records">
          <Text className="custom-records-title">其他已记录疫苗</Text>
          {customRecords.map((record) => (
            <View key={record.id} className="custom-record-item">
              <Text>{record.vaccineName || '未命名疫苗'}</Text>
              <Text>{formatDate(record.startTime)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

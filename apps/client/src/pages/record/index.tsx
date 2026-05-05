import { View, Text, Input, Picker } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useState } from 'react';
import { useRecordStore } from '../../stores/recordStore';
import './index.scss';

const recordTypes = {
  feeding: { title: '喂奶记录', icon: '🍼' },
  diaper: { title: '换尿布记录', icon: '💩' },
  sleep: { title: '睡眠记录', icon: '😴' },
  food: { title: '辅食记录', icon: '🍚' },
  water: { title: '饮水记录', icon: '💧' },
  temperature: { title: '体温记录', icon: '🌡️' },
  height_weight: { title: '身高体重', icon: '📏' },
  medicine: { title: '用药记录', icon: '💊' },
  vaccine: { title: '疫苗记录', icon: '💉' },
  bath: { title: '洗澡记录', icon: '🛁' },
  outdoor: { title: '户外活动', icon: '🌳' },
};

const feedingMethods = [
  { value: 'breast_left', label: '左侧母乳' },
  { value: 'breast_right', label: '右侧母乳' },
  { value: 'breast_both', label: '双侧母乳' },
  { value: 'formula', label: '奶粉' },
];

const diaperStatuses = [
  { value: 'wet', label: '尿了' },
  { value: 'dirty', label: '拉了' },
  { value: 'both', label: '都有' },
];

export default function RecordPage() {
  const router = useRouter();
  const { type = 'feeding', babyId } = router.params;
  const { addRecord } = useRecordStore();

  const [loading, setLoading] = useState(false);
  const [feedingMethod, setFeedingMethod] = useState('formula');
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('');
  const [diaperStatus, setDiaperStatus] = useState('wet');
  const [foodName, setFoodName] = useState('');
  const [temperature, setTemperature] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [medicineName, setMedicineName] = useState('');
  const [medicineDose, setMedicineDose] = useState('');
  const [vaccineName, setVaccineName] = useState('');
  const [vaccineHospital, setVaccineHospital] = useState('');
  const [outdoorLocation, setOutdoorLocation] = useState('');
  const [note, setNote] = useState('');
  const [startTime, setStartTime] = useState(formatTime(new Date()));

  const typeInfo = recordTypes[type] || recordTypes.feeding;

  function formatTime(date: Date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  const handleTimeChange = (e) => {
    setStartTime(e.detail.value);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const [hours, minutes] = startTime.split(':');
      now.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const data: any = {
        babyId,
        type,
        startTime: now.toISOString(),
      };

      switch (type) {
        case 'feeding':
          data.feedingMethod = feedingMethod;
          if (amount) data.amount = parseInt(amount);
          if (duration) data.duration = parseInt(duration);
          break;
        case 'diaper':
          data.diaperStatus = diaperStatus;
          break;
        case 'sleep':
          if (duration) data.duration = parseInt(duration);
          break;
        case 'food':
          data.foodName = foodName;
          break;
        case 'water':
          if (amount) data.amount = parseInt(amount);
          break;
        case 'temperature':
          if (temperature) data.temperature = parseFloat(temperature);
          break;
        case 'height_weight':
          if (height) data.height = parseFloat(height);
          if (weight) data.weight = parseFloat(weight);
          break;
        case 'medicine':
          data.medicineName = medicineName;
          data.medicineDose = medicineDose;
          break;
        case 'vaccine':
          data.vaccineName = vaccineName;
          data.vaccineHospital = vaccineHospital;
          break;
        case 'outdoor':
          data.outdoorLocation = outdoorLocation;
          if (duration) data.duration = parseInt(duration);
          break;
      }

      if (note) data.note = note;

      await addRecord(data);
      Taro.showToast({ title: '记录成功', icon: 'success' });
      setTimeout(() => Taro.navigateBack(), 1500);
    } catch (error) {
      Taro.showToast({ title: '记录失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="record-page">
      <View className="record-header">
        <Text className="record-icon">{typeInfo.icon}</Text>
        <Text className="record-title">{typeInfo.title}</Text>
      </View>

      <View className="record-form">
        {/* 时间选择 */}
        <View className="form-group">
          <Text className="form-label">时间</Text>
          <Picker mode="time" value={startTime} onChange={handleTimeChange}>
            <View className="form-input time-input">
              <Text>{startTime}</Text>
            </View>
          </Picker>
        </View>

        {/* 喂奶相关 */}
        {type === 'feeding' && (
          <>
            <View className="form-group">
              <Text className="form-label">喂养方式</Text>
              <View className="method-grid">
                {feedingMethods.map((m) => (
                  <View
                    key={m.value}
                    className={`method-item ${feedingMethod === m.value ? 'active' : ''}`}
                    onClick={() => setFeedingMethod(m.value)}
                  >
                    <Text>{m.label}</Text>
                  </View>
                ))}
              </View>
            </View>
            {feedingMethod === 'formula' && (
              <View className="form-group">
                <Text className="form-label">奶量 (ml)</Text>
                <Input
                  className="form-input"
                  type="number"
                  placeholder="请输入奶量"
                  value={amount}
                  onInput={(e) => setAmount(e.detail.value)}
                />
              </View>
            )}
            <View className="form-group">
              <Text className="form-label">时长 (分钟)</Text>
              <Input
                className="form-input"
                type="number"
                placeholder="请输入时长"
                value={duration}
                onInput={(e) => setDuration(e.detail.value)}
              />
            </View>
          </>
        )}

        {/* 尿布相关 */}
        {type === 'diaper' && (
          <View className="form-group">
            <Text className="form-label">状态</Text>
            <View className="method-grid">
              {diaperStatuses.map((s) => (
                <View
                  key={s.value}
                  className={`method-item ${diaperStatus === s.value ? 'active' : ''}`}
                  onClick={() => setDiaperStatus(s.value)}
                >
                  <Text>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 睡眠相关 */}
        {type === 'sleep' && (
          <View className="form-group">
            <Text className="form-label">时长 (分钟)</Text>
            <Input
              className="form-input"
              type="number"
              placeholder="请输入睡眠时长"
              value={duration}
              onInput={(e) => setDuration(e.detail.value)}
            />
          </View>
        )}

        {/* 辅食相关 */}
        {type === 'food' && (
          <View className="form-group">
            <Text className="form-label">辅食名称</Text>
            <Input
              className="form-input"
              placeholder="如：米粉、果泥"
              value={foodName}
              onInput={(e) => setFoodName(e.detail.value)}
            />
          </View>
        )}

        {/* 饮水相关 */}
        {type === 'water' && (
          <View className="form-group">
            <Text className="form-label">饮水量 (ml)</Text>
            <Input
              className="form-input"
              type="number"
              placeholder="请输入饮水量"
              value={amount}
              onInput={(e) => setAmount(e.detail.value)}
            />
          </View>
        )}

        {/* 体温相关 */}
        {type === 'temperature' && (
          <View className="form-group">
            <Text className="form-label">体温 (°C)</Text>
            <Input
              className="form-input"
              type="digit"
              placeholder="请输入体温"
              value={temperature}
              onInput={(e) => setTemperature(e.detail.value)}
            />
          </View>
        )}

        {/* 身高体重 */}
        {type === 'height_weight' && (
          <>
            <View className="form-group">
              <Text className="form-label">身高 (cm)</Text>
              <Input
                className="form-input"
                type="digit"
                placeholder="请输入身高"
                value={height}
                onInput={(e) => setHeight(e.detail.value)}
              />
            </View>
            <View className="form-group">
              <Text className="form-label">体重 (kg)</Text>
              <Input
                className="form-input"
                type="digit"
                placeholder="请输入体重"
                value={weight}
                onInput={(e) => setWeight(e.detail.value)}
              />
            </View>
          </>
        )}

        {/* 用药相关 */}
        {type === 'medicine' && (
          <>
            <View className="form-group">
              <Text className="form-label">药品名称</Text>
              <Input
                className="form-input"
                placeholder="请输入药品名称"
                value={medicineName}
                onInput={(e) => setMedicineName(e.detail.value)}
              />
            </View>
            <View className="form-group">
              <Text className="form-label">用药剂量</Text>
              <Input
                className="form-input"
                placeholder="如：1次1包，1天3次"
                value={medicineDose}
                onInput={(e) => setMedicineDose(e.detail.value)}
              />
            </View>
          </>
        )}

        {/* 疫苗相关 */}
        {type === 'vaccine' && (
          <>
            <View className="form-group">
              <Text className="form-label">疫苗名称</Text>
              <Input
                className="form-input"
                placeholder="请输入疫苗名称"
                value={vaccineName}
                onInput={(e) => setVaccineName(e.detail.value)}
              />
            </View>
            <View className="form-group">
              <Text className="form-label">接种医院</Text>
              <Input
                className="form-input"
                placeholder="请输入接种医院"
                value={vaccineHospital}
                onInput={(e) => setVaccineHospital(e.detail.value)}
              />
            </View>
          </>
        )}

        {/* 户外活动 */}
        {type === 'outdoor' && (
          <>
            <View className="form-group">
              <Text className="form-label">活动地点</Text>
              <Input
                className="form-input"
                placeholder="如：小区公园"
                value={outdoorLocation}
                onInput={(e) => setOutdoorLocation(e.detail.value)}
              />
            </View>
            <View className="form-group">
              <Text className="form-label">活动时长 (分钟)</Text>
              <Input
                className="form-input"
                type="number"
                placeholder="请输入活动时长"
                value={duration}
                onInput={(e) => setDuration(e.detail.value)}
              />
            </View>
          </>
        )}

        {/* 备注 */}
        <View className="form-group">
          <Text className="form-label">备注 (可选)</Text>
          <Input
            className="form-input"
            placeholder="添加备注..."
            value={note}
            onInput={(e) => setNote(e.detail.value)}
          />
        </View>
      </View>

      <View className="submit-btn" onClick={handleSubmit}>
        <Text className="submit-text">{loading ? '提交中...' : '保存记录'}</Text>
      </View>
    </View>
  );
}

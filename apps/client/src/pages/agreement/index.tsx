import { View, Text } from '@tarojs/components';
import './index.scss';

export default function AgreementPage() {
  return (
    <View className="agreement-page">
      <View className="agreement-header">
        <Text className="agreement-title">《小宝贝日记》用户协议</Text>
        <Text className="agreement-update">更新日期：2026年5月1日</Text>
      </View>

      <View className="agreement-body">
        <Text className="section-text">
          欢迎您使用"小宝贝日记"小程序（以下简称"本应用"）。请您在使用本应用前仔细阅读并充分理解本协议的全部内容。如果您不同意本协议的任何条款，请您停止使用本应用。您使用本应用即视为您已阅读并同意本协议的约束。
        </Text>

        <Text className="section-title">一、服务内容</Text>
        <Text className="section-text">
          本应用是一款面向家长的宝宝成长记录工具，主要提供以下功能：宝宝日常记录（喂养、睡眠、换尿布等）、成长数据统计分析、宝宝相册管理、多宝宝管理等服务。
        </Text>

        <Text className="section-title">二、账号注册与使用</Text>
        <Text className="section-text">
          1. 您通过微信授权登录本应用，即获得本应用的使用资格。您应确保微信账号的安全性，因微信账号安全问题导致的损失由您自行承担。
        </Text>
        <Text className="section-text">
          2. 您应提供真实、准确的注册信息，并及时更新相关信息。如因信息不真实导致的问题，由您自行承担。
        </Text>
        <Text className="section-text">
          3. 每个用户只能注册一个账号，不得将账号转让、赠与或借给他人使用。
        </Text>

        <Text className="section-title">三、用户行为规范</Text>
        <Text className="section-text">
          您在使用本应用时，应遵守法律法规及本协议的约定，不得利用本应用从事以下行为：
        </Text>
        <Text className="section-text">
          1. 发布、传播违反国家法律法规的内容；
        </Text>
        <Text className="section-text">
          2. 侵犯他人合法权益的行为；
        </Text>
        <Text className="section-text">
          3. 利用技术手段干扰本应用的正常运行；
        </Text>
        <Text className="section-text">
          4. 其他违反法律法规或本协议约定的行为。
        </Text>

        <Text className="section-title">四、知识产权</Text>
        <Text className="section-text">
          本应用的所有内容，包括但不限于文字、图片、音频、视频、软件、程序代码、界面设计等，均受知识产权法律法规保护。未经本应用书面许可，您不得以任何方式复制、修改、传播、分发本应用的任何内容。
        </Text>

        <Text className="section-title">五、用户内容</Text>
        <Text className="section-text">
          1. 您在本应用中发布的文字、图片等内容（以下简称"用户内容"），您保留对用户内容的所有权。
        </Text>
        <Text className="section-text">
          2. 您授予本应用为提供服务所必需的使用权，包括存储、展示、处理用户内容等。
        </Text>
        <Text className="section-text">
          3. 您应确保用户内容不侵犯第三方合法权益，因用户内容引发的纠纷由您自行承担。
        </Text>

        <Text className="section-title">六、隐私保护</Text>
        <Text className="section-text">
          我们非常重视您的隐私保护。关于您的个人信息处理规则，请参阅《隐私政策》。
        </Text>

        <Text className="section-title">七、免责声明</Text>
        <Text className="section-text">
          1. 本应用仅提供记录和参考功能，不提供任何医疗建议。如您有健康方面的疑问，请咨询专业医生。
        </Text>
        <Text className="section-text">
          2. 因不可抗力（包括但不限于自然灾害、网络故障、政策变化等）导致的服务中断，本应用不承担责任。
        </Text>
        <Text className="section-text">
          3. 本应用不对因用户自身原因导致的数据丢失承担责任，建议您定期备份重要数据。
        </Text>

        <Text className="section-title">八、协议变更</Text>
        <Text className="section-text">
          本应用有权根据需要修改本协议条款。协议条款变更后，如果您继续使用本应用，即视为您接受修改后的协议。如果您不接受修改后的协议，请停止使用本应用。
        </Text>

        <Text className="section-title">九、法律适用与争议解决</Text>
        <Text className="section-text">
          1. 本协议的签订、履行和解释均适用中华人民共和国法律。
        </Text>
        <Text className="section-text">
          2. 如双方就本协议内容或其执行发生争议，应友好协商解决；协商不成的，任何一方均有权向本应用运营方所在地有管辖权的人民法院提起诉讼。
        </Text>

        <Text className="section-title">十、联系我们</Text>
        <Text className="section-text">
          如果您对本协议有任何疑问，请通过本应用内的反馈功能与我们联系。
        </Text>
      </View>
    </View>
  );
}
